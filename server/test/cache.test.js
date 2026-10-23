import Redis from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';

import { MemoryCache } from '../src/infra/cache/memory.js';
import { RedisCache } from '../src/infra/cache/redis.js';

/*
 * The contract both adapters have to satisfy, run twice.
 *
 * The Redis half needs a real server. It is skipped where there is none
 * rather than mocked, because the thing worth testing is that the adapter
 * speaks to Redis correctly - a mock would only confirm the mock.
 */
const REDIS_URL = process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:6379';

let redis = null;
try {
  const probe = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  await probe.connect();
  await probe.ping();
  redis = probe;
} catch {
  redis = null;
}

afterAll(async () => {
  if (redis) await redis.quit().catch(() => {});
});

function contract(name, make) {
  describe(name, () => {
    it('returns null for a key never written', async () => {
      const cache = make();
      expect(await cache.get('absent')).toBeNull();
    });

    it('round-trips a structured value', async () => {
      const cache = make();
      await cache.set('job:1', { title: 'Backend Engineer', skills: ['node'] });
      expect(await cache.get('job:1')).toEqual({ title: 'Backend Engineer', skills: ['node'] });
    });

    it('forgets a key once it expires', async () => {
      const cache = make();
      await cache.set('brief', 'value', 1);
      expect(await cache.get('brief')).toBe('value');
      await new Promise((r) => setTimeout(r, 1100));
      expect(await cache.get('brief')).toBeNull();
    });

    it('deletes', async () => {
      const cache = make();
      await cache.set('gone', 1);
      await cache.delete('gone');
      expect(await cache.get('gone')).toBeNull();
    });

    it('clears only what it owns', async () => {
      const cache = make();
      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.clear();
      expect(await cache.get('a')).toBeNull();
      expect(await cache.get('b')).toBeNull();
    });
  });
}

contract('MemoryCache', () => new MemoryCache());

describe.skipIf(!redis)('RedisCache', () => {
  contract('RedisCache', () => new RedisCache({ client: redis, prefix: `test:${Date.now()}:` }));

  it('is visible to a second connection, which is the entire point', async () => {
    const prefix = `shared:${Date.now()}:`;
    const writer = new RedisCache({ client: redis, prefix });
    const second = new Redis(REDIS_URL);
    const reader = new RedisCache({ client: second, prefix });

    await writer.set('seen-by-both', { from: 'replica-1' });
    expect(await reader.get('seen-by-both')).toEqual({ from: 'replica-1' });

    await writer.clear();
    await second.quit();
  });

  it('leaves keys under another prefix alone when cleared', async () => {
    const mine = new RedisCache({ client: redis, prefix: `mine:${Date.now()}:` });
    const theirs = new RedisCache({ client: redis, prefix: `theirs:${Date.now()}:` });

    await mine.set('k', 'mine');
    await theirs.set('k', 'theirs');
    await mine.clear();

    expect(await mine.get('k')).toBeNull();
    expect(await theirs.get('k')).toBe('theirs');
    await theirs.clear();
  });

  it('reports a miss rather than throwing when redis is unreachable', async () => {
    const dead = new Redis('redis://127.0.0.1:6', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    dead.on('error', () => {});
    const cache = new RedisCache({ client: dead, prefix: 'dead:' });

    // A cache that takes the request down with it is worse than no cache.
    expect(await cache.get('anything')).toBeNull();
    await expect(cache.set('anything', 1)).resolves.toBeUndefined();
    dead.disconnect();
  });
});
