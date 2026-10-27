import { createEventRetryWorker } from '@naukri-suvidha/service-kit';

import { logger } from '../../config/logger.js';
import { eventBus } from './eventBus.js';
import { EventDelivery } from './model.js';

/**
 * This service's retry worker, over its own eventDeliveries collection.
 *
 * The worker itself is in service-kit: the notifications service keeps its own
 * retry queue in its own database and runs the same logic over it, and two
 * copies would be two answers to how a delivery is claimed - including the
 * `nextAttemptAt` filter that stops a failing row being re-claimed by the tick
 * that just failed it.
 */
export const eventRetryWorker = createEventRetryWorker({
  logger,
  EventDelivery,
  handlerFor: (name) => eventBus.handlerFor(name),
});
