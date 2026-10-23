import { Cache } from './Cache.js';
import { logger } from '../../config/logger.js';
import { getRedis } from '../redis/index.js';

/**
 * The same interface, shared between replicas.
 *
 * Every method swallows a Redis failure and behaves as a miss. A cache that
 * takes the request down with it when it is unavailable is worse than no
 * cache: the data is still in Mongo, and the only thing lost is the speed-up.
 */
export class RedisCache extends Cache {
  /**
   * `client` is injectable so this can be exercised against a real Redis
   * without the process-wide one having to exist. Everything else takes the
   * shared connection.
   */
  constructor({ prefix = 'cache:', client = null } = {}) {
    super();
    this.prefix = prefix;
    this.client = client;
  }

  #redis() {
    return this.client ?? getRedis();
  }

  #key(key) {
    return `${this.prefix}${key}`;
  }

  async get(key) {
    try {
      const raw = await this.#redis().get(this.#key(key));
      return raw === null ? null : JSON.parse(raw);
    } catch (err) {
      logger.warn({ err, key }, 'cache read failed; treating as a miss');
      return null;
    }
  }

  async set(key, value, ttlSeconds) {
    try {
      const raw = JSON.stringify(value);
      if (ttlSeconds) await this.#redis().set(this.#key(key), raw, 'EX', ttlSeconds);
      else await this.#redis().set(this.#key(key), raw);
    } catch (err) {
      logger.warn({ err, key }, 'cache write failed; carrying on uncached');
    }
  }

  async delete(key) {
    try {
      await this.#redis().del(this.#key(key));
    } catch (err) {
      logger.warn({ err, key }, 'cache delete failed');
    }
  }

  /** Only the keys this cache owns - never FLUSHDB on a shared Redis. */
  async clear() {
    try {
      const redis = this.#redis();
      const stream = redis.scanStream({ match: `${this.prefix}*`, count: 200 });
      for await (const keys of stream) {
        if (keys.length) await redis.del(...keys);
      }
    } catch (err) {
      logger.warn({ err }, 'cache clear failed');
    }
  }
}
