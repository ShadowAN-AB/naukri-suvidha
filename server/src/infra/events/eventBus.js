import { EventEmitter } from 'node:events';
import { logger } from '../../config/logger.js';

/**
 * In-process publish/subscribe. This is the seam that keeps the modules from
 * calling each other directly: `applications` publishes
 * `application.submitted` and does not know or care that `notifications` and
 * `ai` are listening.
 *
 * Handlers are isolated: one that throws is logged and does not take down the
 * publisher or the other subscribers. Delivery is in-process and therefore
 * lost on restart, which is why anything that must survive a crash is written
 * to `aiTasks` instead of being left on the bus.
 */
class EventBus {
  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  /** @returns {() => void} an unsubscribe function */
  subscribe(event, handler) {
    const wrapped = async (payload) => {
      try {
        await handler(payload);
      } catch (err) {
        logger.error({ err, event }, 'event handler failed');
      }
    };
    this.emitter.on(event, wrapped);
    return () => this.emitter.off(event, wrapped);
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
