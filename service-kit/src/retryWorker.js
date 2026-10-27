import { EVENT_DELIVERY_STATUS, MAX_DELIVERY_ATTEMPTS, backoffFrom } from './events.js';

const TICK_MS = 15_000;

/**
 * Runs the deliveries that failed, until they succeed or run out of attempts.
 *
 * Same shape as the AI worker, for the same reason: the database row is the
 * durable part. Rows left `running` by a process that died are put back on
 * the queue at boot rather than sitting there forever.
 *
 * Shared, because every service that consumes events keeps its own retry queue
 * in its own database and the semantics must not differ between them. Two of
 * the details below are not obvious and would be re-derived wrongly: the claim
 * is a single atomic findOneAndUpdate so two processes cannot run one delivery
 * twice, and it filters on `nextAttemptAt` - without which a row whose handler
 * throws goes straight back to `pending` and is re-claimed by the same tick,
 * forever.
 *
 * `handlerFor` is injected rather than imported: each service finds its own
 * handlers, and the API's bus and this service's consumer register them
 * differently.
 */
class EventRetryWorker {
  constructor({ logger, EventDelivery, handlerFor }) {
    this.logger = logger;
    this.EventDelivery = EventDelivery;
    this.handlerFor = handlerFor;
    this.timer = null;
    this.running = false;
  }

  async start() {
    await this.recover();
    this.timer = setInterval(() => {
      this.tick().catch((err) => this.logger.error({ err }, 'delivery retry tick failed'));
    }, TICK_MS);
    // Never the reason the process stays alive.
    this.timer.unref?.();
    this.logger.info('event retry worker started');
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Anything the last process was holding when it stopped. */
  async recover() {
    const stranded = await this.EventDelivery.updateMany(
      { status: EVENT_DELIVERY_STATUS.RUNNING },
      { $set: { status: EVENT_DELIVERY_STATUS.PENDING } },
    );
    if (stranded.modifiedCount) {
      this.logger.info({ stranded: stranded.modifiedCount }, 'requeued stranded deliveries');
    }
  }

  async tick() {
    // One tick at a time: a slow handler must not have a second tick start
    // the same work beside it.
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const row = await this.#claim();
        if (!row) return;
        await this.#run(row);
      }
    } finally {
      this.running = false;
    }
  }

  /** Claim atomically, so two processes cannot run one delivery twice. */
  #claim() {
    return this.EventDelivery.findOneAndUpdate(
      { status: EVENT_DELIVERY_STATUS.PENDING, nextAttemptAt: { $lte: new Date() } },
      { $set: { status: EVENT_DELIVERY_STATUS.RUNNING }, $inc: { attempts: 1 } },
      { new: true, sort: { nextAttemptAt: 1 } },
    );
  }

  async #run(row) {
    const handler = this.handlerFor(row.handler);

    if (!handler) {
      // The subscriber was renamed or removed between the failure and now.
      // Retrying forever would never find it, so it goes straight to dead.
      row.status = EVENT_DELIVERY_STATUS.DEAD;
      row.lastError = `No handler registered as "${row.handler}"`;
      await row.save();
      this.logger.warn({ handler: row.handler, event: row.event }, 'delivery has no handler; dead');
      return;
    }

    try {
      await handler(row.payload);
      row.status = EVENT_DELIVERY_STATUS.DONE;
      row.lastError = undefined;
      await row.save();
      this.logger.info(
        { event: row.event, handler: row.handler, attempts: row.attempts },
        'delivery succeeded on retry',
      );
    } catch (err) {
      const exhausted = row.attempts >= MAX_DELIVERY_ATTEMPTS;
      row.status = exhausted ? EVENT_DELIVERY_STATUS.DEAD : EVENT_DELIVERY_STATUS.PENDING;
      if (!exhausted) row.nextAttemptAt = backoffFrom(row.attempts);
      row.lastError = String(err?.message ?? err).slice(0, 500);
      await row.save();

      this.logger[exhausted ? 'error' : 'warn'](
        { err, event: row.event, handler: row.handler, attempts: row.attempts },
        exhausted ? 'delivery dead after final attempt' : 'delivery failed; will retry',
      );
    }
  }

  /** For the health endpoint: what is waiting, and what gave up. */
  async stats() {
    const [pending, dead] = await Promise.all([
      this.EventDelivery.countDocuments({ status: EVENT_DELIVERY_STATUS.PENDING }),
      this.EventDelivery.countDocuments({ status: EVENT_DELIVERY_STATUS.DEAD }),
    ]);
    return { pending, dead };
  }
}

/**
 * @param {{ logger, EventDelivery, handlerFor: (name: string) => Function|undefined }} deps
 */
export const createEventRetryWorker = (deps) => new EventRetryWorker(deps);
