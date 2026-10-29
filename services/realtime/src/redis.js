import { createRedis } from '@naukri-suvidha/service-kit';

import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Redis carries every push that originates in another process - which, since
 * this service was extracted, is all of them. See sockets.js.
 */
export const { redisEnabled, getRedis, duplicateRedis, closeRedis } = createRedis({
  url: env.REDIS_URL,
  logger,
});
