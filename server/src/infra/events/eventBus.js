import { EventEmitter } from 'node:events';
import { EVENTS } from '@naukri-suvidha/service-kit';

import { logger } from '../../config/logger.js';
import { EventDelivery, OutboxEvent } from './model.js';
import { backoffFrom } from './retry.js';
import { ensureTopics, kafkaEnabled, produceAndWait, startConsumer, startProducer } from './kafka.js';

/**
 * In-process publish/subscribe. This is the seam that keeps the modules from
 * calling each other directly: `applications` publishes
 * `application.submitted` and does not know or care that `notifications` and
 * `ai` are listening.
 *
 * A handler that throws no longer disappears. The failure is written to
 * `eventDeliveries` and retried with backoff by the worker in this folder,
 * and after the last attempt it stays as a dead row rather than as a line in
 * yesterday's logs.
 *
 * Every subscriber is named, and the name is not decoration: it is how a
 * retry finds the handler again in a process that has restarted since - and,
 * with Kafka configured, it is the consumer group, so two modules listening
 * to the same event each get their own copy instead of competing for it.
 *
 * The transport is swappable and the call sites do not know which is in use.
 * Without KAFKA_BROKERS an event is delivered in-process and is lost if the
 * process dies; with it, delivery survives.
 *
 * `publish` takes an optional session. Given one, the event is written to the
 * outbox inside that transaction rather than published immediately, so the
 * event and the record it describes commit together and `outboxWorker`
 * publishes it afterwards. That is what closes the publish-side window, and
 * it needs a replica set - without transactions there is no session to pass,
 * and publishing stays immediate.
 */
class EventBus {
  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
    this.handlers = new Map();
  }

  /**
   * @param {string} event
   * @param {string} name   unique; identifies this handler across restarts
   * @param {(payload: unknown) => unknown} handler
   * @returns {() => void} an unsubscribe function
   */
  subscribe(event, name, handler) {
    if (typeof name !== 'string' || !name) {
      throw new Error(`subscribe(${event}) needs a handler name`);
    }
    if (this.handlers.has(name)) {
      throw new Error(`Duplicate event handler name: ${name}`);
    }
    const deliver = async (payload) => {
      try {
        await handler(payload);
      } catch (err) {
        logger.error({ err, event, handler: name }, 'event handler failed; queued for retry');
        await this.#recordFailure(event, name, payload, err);
      }
    };

    this.handlers.set(name, { event, handler, deliver });

    // With Kafka the consumer delivers; attaching here as well would run
    // every handler twice.
    if (!kafkaEnabled()) this.emitter.on(event, deliver);

    return () => {
      this.emitter.off(event, deliver);
      this.handlers.delete(name);
    };
  }

  /** The retry worker's way back to a handler, given only its name. */
  handlerFor(name) {
    return this.handlers.get(name)?.handler;
  }

  /**
   * Called once, after every module has subscribed. Consumers cannot be
   * started earlier: the set of named handlers is what they are built from.
   */
  async startTransport() {
    if (!kafkaEnabled()) {
      logger.info('event bus: in-process delivery');
      return;
    }
    await startProducer();

    /*
     * Every event's topic, not just the ones this process subscribes to.
     *
     * This used to be derived from the registered handlers, which was right
     * while one process held every subscriber. It stopped being right when
     * notifications moved out: that service subscribes to `job.approved` and
     * `interview.scheduled`, which nothing here listens to, so deriving from
     * handlers would leave those two topics uncreated until the first produce
     * - and a consumer that subscribes before then hits exactly the
     * "server does not host this topic-partition" race ensureTopics exists to
     * avoid.
     *
     * This process is the only producer, so it is the right one to create
     * them all. The list is EVENTS in service-kit, which is also where the
     * consumer gets the names from, so there is no second list to keep in
     * step.
     */
    await ensureTopics(Object.values(EVENTS));

    /*
     * In parallel, and the difference is not cosmetic. Joining a consumer
     * group costs a rebalance round trip of a few seconds; started one after
     * another, eight groups took about forty seconds, during which the HTTP
     * server has not begun listening. The healthcheck gave up before that and
     * Docker restarted the container, which started the forty seconds again.
     */
    await Promise.all(
      [...this.handlers].map(([name, { event, deliver }]) => startConsumer(event, name, deliver)),
    );
    logger.info({ subscribers: this.handlers.size }, 'event bus: kafka delivery');
  }

  async #recordFailure(event, handler, payload, err) {
    try {
      await EventDelivery.create({
        event,
        handler,
        payload,
        attempts: 1,
        nextAttemptAt: backoffFrom(1),
        lastError: String(err?.message ?? err).slice(0, 500),
      });
    } catch (writeErr) {
      // The retry record itself failed. There is nothing left to fall back
      // on, so say so at the level that gets noticed.
      logger.error({ err: writeErr, event, handler }, 'could not record a failed delivery');
    }
  }

  /**
   * @param {string} event
   * @param {unknown} payload
   * @param {{ session?: import('mongoose').ClientSession | null }} [opts]
   *   Pass the session of the transaction that wrote the record this event is
   *   about, and the event is committed with it instead of being published
   *   now. That is the outbox, and it is what closes the publish-side window.
   *
   * Returns a promise when it writes an outbox row and nothing when it
   * publishes directly, so callers inside a transaction must await it.
   */
  publish(event, payload, { session } = {}) {
    logger.debug({ event, payload, outboxed: Boolean(session) }, 'event published');

    /*
     * The session is the whole signal. If one is present we are inside a
     * transaction that is about to commit a business record, so the event
     * joins it: either both land or neither does, and there is no window in
     * between for a dying process to fall into.
     *
     * No session means either a standalone mongod (no transactions to join)
     * or a caller that has not been converted, and the behaviour is the one
     * that shipped before: publish now, and accept the window.
     */
    if (session) {
      return OutboxEvent.create([{ event, payload }], { session });
    }

    /*
     * Not outboxed, so this is the old contract and it keeps the old
     * behaviour: the business write has already succeeded, so a transport
     * failure must not become a failed request. It is logged at a level that
     * gets noticed and the event is lost - which is precisely the window the
     * outbox exists to close, and precisely why the message says so.
     */
    return this.publishNow(event, payload).catch((err) =>
      logger.error({ err, event }, 'publish failed outside a transaction; event lost'),
    );
  }

  /**
   * Put an event on the bus this instant, with no durability of its own.
   *
   * Called directly for events with nothing transactional behind them, and by
   * `outboxWorker` once a row has committed. A failure here must throw rather
   * than be swallowed, because the worker decides whether to retry and can
   * only do that if it is told.
   */
  async publishNow(event, payload) {
    if (kafkaEnabled()) {
      await produceAndWait(event, payload);
      return;
    }
    this.emitter.emit(event, payload);
  }

  listenerCount(event) {
    return this.emitter.listenerCount(event);
  }
}

export const eventBus = new EventBus();
