import { EventEmitter } from 'node:events';
import { logger } from '../../config/logger.js';
import { EventDelivery } from './model.js';
import { backoffFrom } from './retry.js';

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
 * retry finds the handler again in a process that has restarted since.
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
    this.handlers.set(name, handler);

    const wrapped = async (payload) => {
      try {
        await handler(payload);
      } catch (err) {
        logger.error({ err, event, handler: name }, 'event handler failed; queued for retry');
        await this.#recordFailure(event, name, payload, err);
      }
    };

    this.emitter.on(event, wrapped);
    return () => {
      this.emitter.off(event, wrapped);
      this.handlers.delete(name);
    };
  }

  /** The retry worker's way back to a handler, given only its name. */
  handlerFor(name) {
    return this.handlers.get(name);
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

  publish(event, payload) {
    logger.debug({ event, payload }, 'event published');
    this.emitter.emit(event, payload);
  }

  listenerCount(event) {
    return this.emitter.listenerCount(event);
  }
}

export const eventBus = new EventBus();
