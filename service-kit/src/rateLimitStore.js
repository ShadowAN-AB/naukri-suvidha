import { MemoryStore } from 'express-rate-limit';

/**
 * A rate-limit store that falls back to an in-process counter when the shared
 * one is unreachable.
 *
 * This exists because the obvious fix is the wrong one. `express-rate-limit`
 * offers `passOnStoreError: true`, which lets the request through *unlimited*
 * when the store rejects - and on `POST /login` that means unbounded password
 * guessing for as long as Redis is away. The limiter would stop failing
 * requests by stopping being a limiter.
 *
 * The right shape comes from what this system already does with the cache. A
 * Redis failure there is a **miss**: the caller falls through to the path it
 * would take if Redis were not configured at all, and the request is served.
 * The limiter's equivalent of a miss is therefore not "no limit", it is the
 * **per-process limiter** - exactly what runs when `REDIS_URL` is unset. So an
 * outage degrades a shared limit of five a minute to five a minute per
 * replica, which is the single-instance behaviour this project supports and
 * documents, rather than to no limit at all.
 *
 * ## Why it asks the connection rather than trying the command
 *
 * The first version of this file tried the primary on every request and fell
 * back when it threw. That is the obvious shape and it was measured to be
 * useless:
 *
 *     increment 1: totalHits=1  took  2063ms
 *     increment 2: totalHits=2  took 10026ms
 *     increment 3: totalHits=3  took 15420ms
 *     ...
 *     increment 6: totalHits=1  took 15385ms
 *
 * Every request waited about **fifteen seconds** for the dead Redis to
 * exhaust `maxRetriesPerRequest` before being served. Two things follow, and
 * the second one is worse than the bug this file was written to fix:
 *
 * 1. A Redis outage became a fifteen-second stall on every request. Not
 *    failing the request is no use if it is answered a quarter of a minute
 *    late.
 * 2. **The limit stopped biting.** Five increments at 15s each is 75s, longer
 *    than the 60s window, so the window expired before the sixth attempt and
 *    the counter reset - see the `totalHits=1` on increment 6. A limiter whose
 *    own slowness outlives its window does not limit anything.
 *
 * So the gate is the client's connection state, which ioredis already tracks
 * and which costs nothing to read: not `ready` means use the fallback *now*,
 * without issuing a command that is going to time out. The try/catch stays
 * underneath for the narrow race where the status is `ready` and the command
 * fails anyway.
 *
 * Recovery needs no cool-off and no probe: ioredis flips back to `ready` of
 * its own accord, and `rate-limit-redis` repairs its Lua script on the first
 * call after that - `retryableIncrement` reloads the cached SHA when it
 * rejects. The first request once Redis is back is what puts the shared
 * counter into service again.
 *
 * ## What it costs
 *
 * - **The counters are separate.** The in-process counter starts at zero when
 *   the outage begins, so an attacker mid-window gets a fresh budget once, and
 *   one per replica. Bounded and small; unbounded is the alternative.
 * - **A hit either side of a recovery can drift by one.** `increment` may land
 *   on the fallback while the `decrement` that `skipSuccessfulRequests` issues
 *   lands on a recovered Redis. For a five-per-minute limiter that is
 *   immaterial, and tracking which store served each key buys precision nobody
 *   can observe.
 * - **A brand-new connection is not `ready` for a few milliseconds**, so a
 *   request arriving in that gap is counted in process. Harmless, and the same
 *   answer the service would give with no Redis configured at all.
 */
export class FallbackRateLimitStore {
  /**
   * `localKeys` and `prefix` both mirror the primary deliberately.
   *
   * The library reads them in its own validation: `singleCount` groups by the
   * store instance when `localKeys` is true and by the constructor name when
   * it is false, disambiguating with `store.prefix`. Two limiters of this
   * class on one request - a global one and a login one, both keyed by IP -
   * would otherwise look like the same key counted twice and throw
   * ERR_ERL_DOUBLE_COUNT. So the prefix has to be visible here, not just
   * inside the primary.
   */
  localKeys = false;

  #primary;
  #fallback = new MemoryStore();
  #logger;
  #isReady;
  #degraded = false;

  constructor({ primary, prefix, logger, isReady }) {
    this.#primary = primary;
    this.prefix = prefix;
    this.#logger = logger;
    // Default to "always ready" so a caller without a connection to ask still
    // gets the try/catch behaviour rather than silently never using Redis.
    this.#isReady = isReady ?? (() => true);
  }

  init(options) {
    this.#primary.init?.(options);
    // Needs its own init: the window length is what sizes its buckets, and
    // without it an outage would count against an undefined window.
    this.#fallback.init(options);
  }

  /**
   * One warning per transition, not one per request.
   *
   * A Redis outage is every request's problem, so logging per call turns a
   * dependency being away into tens of thousands of identical lines - which is
   * how the one line that mattered gets lost. The edges carry the information.
   */
  #setDegraded(degraded, err) {
    if (degraded === this.#degraded) return;
    this.#degraded = degraded;
    this.#logger.warn(
      degraded ? { err, prefix: this.prefix } : { prefix: this.prefix },
      degraded
        ? 'rate limit store unreachable; counting in process until it returns'
        : 'rate limit store recovered; counters are shared again',
    );
  }

  async #withFallback(method, ...args) {
    // The fast path out. Reading a status field cannot block; issuing a
    // command to a Redis that is not there blocks for maxRetriesPerRequest.
    if (!this.#isReady()) {
      this.#setDegraded(true);
      return this.#fallback[method](...args);
    }

    try {
      const result = await this.#primary[method](...args);
      this.#setDegraded(false);
      return result;
    } catch (err) {
      this.#setDegraded(true, err);
      return this.#fallback[method](...args);
    }
  }

  async increment(key) {
    return this.#withFallback('increment', key);
  }

  async decrement(key) {
    return this.#withFallback('decrement', key);
  }

  async resetKey(key) {
    return this.#withFallback('resetKey', key);
  }

  async get(key) {
    return this.#withFallback('get', key);
  }

  /** True while the shared store is unreachable. Read by the tests. */
  get degraded() {
    return this.#degraded;
  }

  shutdown() {
    this.#primary.shutdown?.();
    // The fallback holds an interval. It is unref'd, so it cannot keep a
    // process alive, but a service that shuts down cleanly should still let go
    // of it.
    this.#fallback.shutdown?.();
  }
}
