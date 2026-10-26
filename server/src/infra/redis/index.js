import { createRedis } from '@naukri-suvidha/service-kit';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * This service's Redis connection, built from its own environment.
 *
 * The connection options are in service-kit, because the auth service needs
 * the same ones and the two bounds below are each a crash that was found the
 * hard way - the offline queue that must stay on, and the unbounded pub/sub
 * pair. A second copy of those would be a second chance to get them wrong.
 */
export const { redisEnabled, getRedis, duplicateRedis, createRateLimitStore, closeRedis } =
  createRedis({ url: env.REDIS_URL, logger });
