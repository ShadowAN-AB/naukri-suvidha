import Redis from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';

import { FallbackRateLimitStore, createRedis } from '@naukri-suvidha/service-kit';

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

/*
 * The rate limiter has to obey the same rule as the cache, and for a long time
 * it did not: a Redis that went away mid-request made the store reject, and
 * express-rate-limit turns a rejected store into a 500 on somebody's login.
 *
 * These are here rather than in their own file because the property under test
 * is the one this file exists for - what Redis-backed infrastructure does when
 * Redis is gone - and because the interesting half needs no Redis at all. A
 * store whose primary always throws is a more reliable outage than a real one.
 */
describe('FallbackRateLimitStore', () => {
  const throwing = {
    init() {},
    increment: async () => {
      throw new Error('Reached the max retries per request limit (which is 2).');
    },
    decrement: async () => {
      throw new Error('unreachable');
    },
    resetKey: async () => {
      throw new Error('unreachable');
    },
    get: async () => {
      throw new Error('unreachable');
    },
  };

  const silent = { warn: () => {} };
  const make = (primary) => {
    const store = new FallbackRateLimitStore({ primary, prefix: 'rl:test:', logger: silent });
    store.init({ windowMs: 60_000 });
    return store;
  };

  it('counts in process instead of throwing when the shared store is away', async () => {
    const store = make(throwing);

    // Read at the time of the call, not held: MemoryStore returns its live
    // client record, so two kept references are one object and both would
    // read 2. The library reads totalHits immediately, so that is fine for
    // the store and only a trap for a test.
    const { totalHits: first } = await store.increment('1.2.3.4');
    const { totalHits: second } = await store.increment('1.2.3.4');

    // The point: a limit of five still means five, rather than meaning
    // nothing (passOnStoreError) or meaning a 500 (the old behaviour).
    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(store.degraded).toBe(true);
  });

  it('keys stay separate while degraded', async () => {
    const store = make(throwing);

    await store.increment('1.1.1.1');
    await store.increment('1.1.1.1');
    const { totalHits: other } = await store.increment('2.2.2.2');

    // One client's budget must not be spent by another's traffic.
    expect(other).toBe(1);
  });

  it('prefers the shared store, and goes back to it on recovery', async () => {
    let up = false;
    let sharedHits = 0;
    const flapping = {
      init() {},
      increment: async () => {
        if (!up) throw new Error('down');
        sharedHits += 1;
        return { totalHits: sharedHits, resetTime: undefined };
      },
    };

    const store = make(flapping);

    await store.increment('ip');
    expect(store.degraded).toBe(true);

    up = true;
    const recovered = await store.increment('ip');

    // Back on the shared counter, which is what makes the limit shared again
    // across replicas - the whole reason Redis is there.
    expect(recovered.totalHits).toBe(1);
    expect(sharedHits).toBe(1);
    expect(store.degraded).toBe(false);
  });

  it('does not touch the primary when the connection is not ready', async () => {
    // The property that makes this usable rather than merely correct. Trying
    // the command first cost ~15s per request against a dead port, which was
    // long enough for the limiter's own 60s window to expire underneath it -
    // so the limit stopped biting. Reading the connection state cannot block.
    let touched = 0;
    const exploding = {
      init() {},
      increment: async () => {
        touched += 1;
        throw new Error('should never be called while not ready');
      },
    };
    const store = new FallbackRateLimitStore({
      primary: exploding,
      prefix: 'rl:notready:',
      logger: silent,
      isReady: () => false,
    });
    store.init({ windowMs: 60_000 });

    const hits = [];
    for (let i = 0; i < 6; i += 1) {
      hits.push((await store.increment('ip')).totalHits);
    }

    expect(hits).toEqual([1, 2, 3, 4, 5, 6]);
    expect(touched).toBe(0);
    expect(store.degraded).toBe(true);
  });

  it('uses the shared store again as soon as the connection is ready', async () => {
    let ready = false;
    const primary = {
      init() {},
      increment: async () => ({ totalHits: 99, resetTime: undefined }),
    };
    const store = new FallbackRateLimitStore({
      primary,
      prefix: 'rl:flap:',
      logger: silent,
      isReady: () => ready,
    });
    store.init({ windowMs: 60_000 });

    expect((await store.increment('ip')).totalHits).toBe(1);

    ready = true;

    // 99 is the shared store answering: no cool-off, no probe interval. The
    // first request after Redis returns is served by Redis.
    expect((await store.increment('ip')).totalHits).toBe(99);
    expect(store.degraded).toBe(false);
  });

  it.skipIf(!redis)('is what createRateLimitStore actually hands back', async () => {
    /*
     * A behavioural check on the factory, not a shape one, and it exists
     * because the static claim in docs:check cannot be this. That claim greps
     * for `new FallbackRateLimitStore(` in the factory - which a dead `return
     * store;` placed above it would leave untouched, quietly handing back the
     * bare Redis store and restoring the 500. Proven by planting exactly
     * that: the grep still passed.
     *
     * Run against the live Redis rather than a dead port on purpose. A
     * never-connected ioredis client cannot `quit()`, so a dead-port variant
     * of this test hangs in teardown - the degradation path is covered above
     * with a primary that simply throws, which needs no socket at all.
     */
    const { createRateLimitStore, getRedis, closeRedis } = createRedis({
      url: REDIS_URL,
      logger: { warn: () => {}, info: () => {}, error: () => {} },
    });

    const a = createRateLimitStore('rl:factory:');
    const b = createRateLimitStore('rl:factory:');

    // A bare RedisStore here is the regression: it is what answered 500.
    expect(a).toBeInstanceOf(FallbackRateLimitStore);

    // Wait for `ready` rather than sleeping, because the gate is exactly that
    // flag: a request arriving while the socket is still connecting is
    // counted in process, which is correct behaviour and would otherwise
    // make this test flaky by design.
    const client = getRedis();
    if (client.status !== 'ready') await new Promise((done) => client.once('ready', done));

    a.init({ windowMs: 60_000 });
    b.init({ windowMs: 60_000 });

    const key = `probe-${Date.now()}`;
    const first = (await a.increment(key)).totalHits;
    const second = (await b.increment(key)).totalHits;

    // Two stores, one counter: the shared limit Redis is there to provide,
    // still working through the wrapper rather than around it.
    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(a.degraded).toBe(false);

    await a.resetKey(key);
    await closeRedis();
  });

  it('exposes the prefix, so two limiters are not read as one double count',
    async () => {
      // express-rate-limit groups its double-count validation by constructor
      // name when localKeys is false, disambiguating on store.prefix. Without
      // this, a global limiter and a login limiter both keyed by IP would
      // throw ERR_ERL_DOUBLE_COUNT on the same request.
      const store = make(throwing);
      expect(store.prefix).toBe('rl:test:');
      expect(store.localKeys).toBe(false);
    });
});
