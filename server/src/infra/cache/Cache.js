/**
 * A small key/value cache with expiry. Backed by memory today; the interface
 * is here so a Redis implementation can be dropped in without touching a
 * caller.
 */
export class Cache {
  async get(_key) {
    throw new Error('Cache.get is not implemented');
  }
  async set(_key, _value, _ttlSeconds) {
    throw new Error('Cache.set is not implemented');
  }
  async delete(_key) {
    throw new Error('Cache.delete is not implemented');
  }
  async clear() {
    throw new Error('Cache.clear is not implemented');
  }
}
