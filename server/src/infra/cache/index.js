import { MemoryCache } from './memory.js';

let instance = null;

export function getCache() {
  if (!instance) instance = new MemoryCache();
  return instance;
}

export { Cache } from './Cache.js';
