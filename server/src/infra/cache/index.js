import { MemoryCache } from './memory.js';
import { RedisCache } from './redis.js';
import { redisEnabled } from '../redis/index.js';
import { logger } from '../../config/logger.js';

let instance = null;

/**
 * Redis when it is configured, memory when it is not. Callers never learn
 * which, which is the whole point of the interface.
 */
export function getCache() {
  if (!instance) {
    instance = redisEnabled() ? new RedisCache() : new MemoryCache();
    logger.info({ provider: redisEnabled() ? 'redis' : 'memory' }, 'cache ready');
  }
  return instance;
}

/** Tests build their own and need the shared one forgotten between files. */
export function resetCache() {
  instance = null;
}

export { Cache } from './Cache.js';
