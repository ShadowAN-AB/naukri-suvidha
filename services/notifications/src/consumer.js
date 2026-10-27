import { Kafka, logLevel } from 'kafkajs';
import { backoffFrom, groupIdFor } from '@naukri-suvidha/service-kit';

import { env } from './env.js';
import { logger } from './logger.js';
import { EventDelivery } from './model.js';

/**
 * The consume side of the bus, and only the consume side.
 *
 * The API has a whole event bus: an in-process EventEmitter for when there is
 * no broker, a producer, an outbox that commits an event with the write that
 * caused it, and transaction detection. None of that belongs here. This
 * service publishes nothing and has no business writes to commit anything
 * with - it reads topics and runs handlers.
 *
 * So this is deliberately not the API's bus imported from somewhere. What the
 * two processes share is in service-kit, and it is exactly the part they must
 * agree on: the topic names, and that a handler name becomes its consumer
 * group. The rest is each service's own job, done the way that service needs.
 *
 * One group per handler, which is what makes this service's copy of
 * `application.submitted` independent of the AI worker's.
 */

let kafka = null;
const consumers = [];

export const kafkaEnabled = () => Boolean(env.KAFKA_BROKERS);

function client() {
  if (!kafka) {
    kafka = new Kafka({
      clientId: env.KAFKA_CLIENT_ID,
      brokers: env.KAFKA_BROKERS.split(',').map((b) => b.trim()).filter(Boolean),
      logLevel: logLevel.WARN,
      retry: { initialRetryTime: 300, retries: 8 },
    });
  }
  return kafka;
}

/**
 * Wrap a handler so a throw is recorded rather than lost.
 *
 * The offset is committed either way, on purpose. Kafka's own redelivery
 * covers a process that dies mid-handler; a handler that merely threw is a
 * different failure and is covered by a row here, retried on the shared
 * backoff. One mechanism per failure mode, rather than two fighting - the
 * alternative, letting it throw, blocks the partition on a bug.
 */
const guarded = (event, name, handler) => async (payload) => {
  try {
    await handler(payload);
  } catch (err) {
    logger.error({ err, event, handler: name }, 'handler failed; queued for retry');
    try {
      await EventDelivery.create({
        event,
        handler: name,
        payload,
        attempts: 1,
        nextAttemptAt: backoffFrom(1),
        lastError: String(err?.message ?? err).slice(0, 500),
      });
    } catch (writeErr) {
      // Nothing left to fall back on, so say so at the level that gets noticed.
      logger.error({ err: writeErr, event, handler: name }, 'could not record a failed delivery');
    }
  }
};

const registered = new Map();

/** Register a handler. Nothing is consumed until `start()`. */
export function on(event, name, handler) {
  if (registered.has(name)) throw new Error(`Duplicate event handler name: ${name}`);
  registered.set(name, { event, handler, deliver: guarded(event, name, handler) });
}

/** The retry worker's way back to a handler, given only its name. */
export const handlerFor = (name) => registered.get(name)?.handler;

/**
 * Join every registered handler's consumer group.
 *
 * In parallel, and the difference is not cosmetic: joining a group costs a
 * rebalance round trip of seconds, so five groups started one after another
 * would hold up `app.listen()` long enough for a healthcheck to give up and
 * restart the container - which starts the wait again. The API learnt this
 * with eight groups taking about forty seconds.
 *
 * No `ensureTopics` here. The API creates every registered event's topic with
 * `waitForLeaders` before any of its own consumers subscribe, and it owns the
 * producer, so by the time anything is published the topics exist. This
 * service subscribing to a topic that does not exist yet is the one case
 * kafkajs retries cleanly on its own.
 */
export async function start() {
  if (!kafkaEnabled()) {
    logger.warn(
      { handlers: registered.size },
      'KAFKA_BROKERS is not set: the inbox will serve, and no notification will ever be created',
    );
    return;
  }

  await Promise.all(
    [...registered].map(async ([name, { event, deliver }]) => {
      const groupId = groupIdFor(name);
      const consumer = client().consumer({ groupId, allowAutoTopicCreation: true });
      await consumer.connect();
      await consumer.subscribe({ topic: event, fromBeginning: false });
      await consumer.run({
        eachMessage: async ({ message }) => {
          let payload = {};
          try {
            payload = JSON.parse(message.value?.toString() ?? '{}');
          } catch (err) {
            logger.error({ err, event, groupId }, 'unreadable kafka message; skipping');
            return;
          }
          await deliver(payload);
        },
      });
      consumers.push(consumer);
      logger.info({ event, groupId }, 'consumer running');
    }),
  );
  logger.info({ handlers: registered.size }, 'all consumers joined');
}

export async function close() {
  await Promise.allSettled(consumers.map((c) => c.disconnect()));
  consumers.length = 0;
  kafka = null;
}
