import { Cache } from './Cache.js';

/**
 * Process-local cache. Entries are evicted lazily on read and swept
 * periodically so an abandoned key cannot pin memory forever.
 */
export class MemoryCache extends Cache {
  constructor({ sweepMs = 60_000 } = {}) {
    super();
    this.store = new Map();
    this.timer = setInterval(() => this.#sweep(), sweepMs);
    this.timer.unref(); // never hold the process open
  }

  #sweep() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt && entry.expiresAt <= now) this.store.delete(key);
    }
  }

  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, ttlSeconds) {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async delete(key) {
    this.store.delete(key);
  }

  async clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}
