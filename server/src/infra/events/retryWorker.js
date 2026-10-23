import { logger } from '../../config/logger.js';
import { EVENT_DELIVERY_STATUS } from '../../lib/constants.js';
import { eventBus } from './eventBus.js';
import { EventDelivery } from './model.js';
import { MAX_DELIVERY_ATTEMPTS, backoffFrom } from './retry.js';

const TICK_MS = 15_000;

/**
 * Runs the deliveries that failed, until they succeed or run out of attempts.
 *
 * Same shape as the AI worker, for the same reason: the database row is the
 * durable part. Rows left `running` by a process that died are put back on
 * the queue at boot rather than sitting there forever.
 */
class EventRetryWorker {
  constructor() {
    this.timer = null;
    this.running = false;
  }

  async start() {
    await this.recover();
    this.timer = setInterval(() => {
      this.tick().catch((err) => logger.error({ err }, 'delivery retry tick failed'));
    }, TICK_MS);
    // Never the reason the process stays alive.
    this.timer.unref?.();
    logger.info('event retry worker started');
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Anything the last process was holding when it stopped. */
  async recover() {
    const stranded = await EventDelivery.updateMany(
      { status: EVENT_DELIVERY_STATUS.RUNNING },
      { $set: { status: EVENT_DELIVERY_STATUS.PENDING } },
    );
    if (stranded.modifiedCount) {
      logger.info({ stranded: stranded.modifiedCount }, 'requeued stranded deliveries');
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
    return EventDelivery.findOneAndUpdate(
      { status: EVENT_DELIVERY_STATUS.PENDING, nextAttemptAt: { $lte: new Date() } },
      { $set: { status: EVENT_DELIVERY_STATUS.RUNNING }, $inc: { attempts: 1 } },
      { new: true, sort: { nextAttemptAt: 1 } },
    );
  }

  async #run(row) {
    const handler = eventBus.handlerFor(row.handler);

    if (!handler) {
      // The subscriber was renamed or removed between the failure and now.
      // Retrying forever would never find it, so it goes straight to dead.
      row.status = EVENT_DELIVERY_STATUS.DEAD;
      row.lastError = `No handler registered as "${row.handler}"`;
      await row.save();
      logger.warn({ handler: row.handler, event: row.event }, 'delivery has no handler; dead');
      return;
    }

    try {
      await handler(row.payload);
      row.status = EVENT_DELIVERY_STATUS.DONE;
      row.lastError = undefined;
      await row.save();
      logger.info(
        { event: row.event, handler: row.handler, attempts: row.attempts },
        'delivery succeeded on retry',
      );
    } catch (err) {
      const exhausted = row.attempts >= MAX_DELIVERY_ATTEMPTS;
      row.status = exhausted ? EVENT_DELIVERY_STATUS.DEAD : EVENT_DELIVERY_STATUS.PENDING;
      if (!exhausted) row.nextAttemptAt = backoffFrom(row.attempts);
      row.lastError = String(err?.message ?? err).slice(0, 500);
      await row.save();

      logger[exhausted ? 'error' : 'warn'](
        { err, event: row.event, handler: row.handler, attempts: row.attempts },
        exhausted ? 'delivery dead after final attempt' : 'delivery failed; will retry',
      );
    }
  }

  /** For the health endpoint: what is waiting, and what gave up. */
  async stats() {
    const [pending, dead] = await Promise.all([
      EventDelivery.countDocuments({ status: EVENT_DELIVERY_STATUS.PENDING }),
      EventDelivery.countDocuments({ status: EVENT_DELIVERY_STATUS.DEAD }),
    ]);
    return { pending, dead };
  }
}

export const eventRetryWorker = new EventRetryWorker();
