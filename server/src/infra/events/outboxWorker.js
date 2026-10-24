import { logger } from '../../config/logger.js';
import { OUTBOX_STATUS } from '../../lib/constants.js';
import { OutboxEvent } from './model.js';

const TICK_MS = 1_000;
const MAX_PUBLISH_ATTEMPTS = 10;

/**
 * Turns committed intents into published events.
 *
 * The outbox row is written inside the transaction that wrote the business
 * record, so by the time this worker sees one the thing it describes has
 * definitely happened. All that is left is to get it onto the bus — and that
 * can now be retried for as long as it takes, because the record of the
 * intent is durable.
 *
 * A one-second tick, unlike the retry worker's fifteen. This is the fast path
 * for every event in the system rather than a long-stop for failures, so the
 * delay it adds is felt: a notification arriving a second after the click is
 * fine, fifteen is not.
 */
class OutboxWorker {
  constructor() {
    this.timer = null;
    this.running = false;
    this.deliver = null;
  }

  /**
   * `deliver` is the bus's own publish-now function. Injected rather than
   * imported to keep this file from importing the bus that imports it.
   */
  async start(deliver) {
    this.deliver = deliver;
    await this.recover();
    this.timer = setInterval(() => {
      this.tick().catch((err) => logger.error({ err }, 'outbox tick failed'));
    }, TICK_MS);
    this.timer.unref?.();
    logger.info('outbox worker started');
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Rows a dead process left mid-publish.
   *
   * These are the one genuinely ambiguous case in the design: the process may
   * have produced the event before dying, or not. Requeueing means a consumer
   * can see it twice, which is why at-least-once is the contract and why
   * handlers have to tolerate a repeat. Losing it instead would defeat the
   * entire point of the outbox.
   */
  async recover() {
    const stranded = await OutboxEvent.updateMany(
      { status: OUTBOX_STATUS.PUBLISHING },
      { $set: { status: OUTBOX_STATUS.PENDING } },
    );
    if (stranded.modifiedCount) {
      logger.info({ stranded: stranded.modifiedCount }, 'requeued stranded outbox events');
    }
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const row = await this.#claim();
        if (!row) return;
        await this.#publish(row);
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Oldest first, and atomically.
   *
   * The sort is not cosmetic: two events about one application have to reach
   * consumers in the order they were committed, or a notification describes a
   * state that has not been announced yet.
   */
  #claim() {
    return OutboxEvent.findOneAndUpdate(
      { status: OUTBOX_STATUS.PENDING },
      { $set: { status: OUTBOX_STATUS.PUBLISHING }, $inc: { attempts: 1 } },
      { new: true, sort: { createdAt: 1 } },
    );
  }

  async #publish(row) {
    try {
      await this.deliver(row.event, row.payload);
      row.status = OUTBOX_STATUS.PUBLISHED;
      row.publishedAt = new Date();
      row.lastError = undefined;
      await row.save();
    } catch (err) {
      // Back to pending, however many times it takes. There is no `dead`
      // status here on purpose: a dead outbox row would be exactly the lost
      // event this exists to prevent. After enough attempts it stays pending
      // and loud instead, because the right response is to fix the bus, not
      // to drop the event.
      row.status = OUTBOX_STATUS.PENDING;
      row.lastError = String(err?.message ?? err).slice(0, 500);
      await row.save();

      logger[row.attempts >= MAX_PUBLISH_ATTEMPTS ? 'error' : 'warn'](
        { err, event: row.event, attempts: row.attempts },
        'outbox publish failed; still pending',
      );
    }
  }

  /** For the health endpoint: a backlog here means events are not flowing. */
  async stats() {
    const [pending, stuck] = await Promise.all([
      OutboxEvent.countDocuments({ status: OUTBOX_STATUS.PENDING }),
      OutboxEvent.countDocuments({
        status: OUTBOX_STATUS.PENDING,
        attempts: { $gte: MAX_PUBLISH_ATTEMPTS },
      }),
    ]);
    return { pending, stuck };
  }
}

export const outboxWorker = new OutboxWorker();
export { MAX_PUBLISH_ATTEMPTS };
