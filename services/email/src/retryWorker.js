import { createEventRetryWorker } from '@naukri-suvidha/service-kit';

import { logger } from './logger.js';
import { EventDelivery } from './model.js';
import { handlerFor } from './consumer.js';

/**
 * This service's retry queue, in this service's database.
 *
 * The worker is service-kit's; what differs is whose rows it reads and whose
 * handlers it looks up. A handler that threw - mongo blinked, or there is a
 * bug in the copy - is retried here on the shared backoff, independently of
 * whatever the API's own queue is doing.
 */
export const eventRetryWorker = createEventRetryWorker({
  logger,
  EventDelivery,
  handlerFor,
});
