import { createRedis } from '@naukri-suvidha/service-kit';

import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Redis here does one job, and it is not caching: it carries socket emits to
 * whichever API replica holds a user's connection. See sockets.js.
 */
export const { redisEnabled, getRedis, closeRedis } = createRedis({
  url: env.REDIS_URL,
  logger,
});
