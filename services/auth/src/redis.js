import { createRedis } from '@naukri-suvidha/service-kit';

import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Redis here does one job: the login and registration counters, shared across
 * this service's own replicas.
 *
 * It matters for the same reason it mattered in the API. Five login attempts a
 * minute enforced per process is five times however many replicas there are,
 * and the login limiter is the one that is actually holding something back.
 */
export const { redisEnabled, getRedis, createRateLimitStore, closeRedis } = createRedis({
  url: env.REDIS_URL,
  logger,
});
