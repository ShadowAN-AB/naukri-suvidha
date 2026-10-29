import Redis from 'ioredis';
import { RedisStore } from 'rate-limit-redis';

import { FallbackRateLimitStore } from './rateLimitStore.js';

/**
 * One Redis connection per service, shared within it.
 *
 * Redis is optional on purpose. Without `REDIS_URL` a service runs exactly as
 * it did: an in-process cache, a per-process rate limiter, sockets held in one
 * process. That is the single-instance story and it still has to work, because
 * `npm run dev` is not going to start a Redis.
 *
 * With it, the three things that could not survive a second replica start
 * working: a cache both replicas can see, one rate-limit counter between them,
 * and sockets that reach a user whichever replica holds the connection.
 *
 * This is in service-kit rather than in either service for one reason: the two
 * crashes documented below. Both were found the hard way, both are one flag
 * each, and both would be rediscovered by whichever service wrote its own copy
 * of this file - the auth service shares the login rate limit across its own
 * replicas, so it needs exactly this connection and exactly these bounds.
 *
 * A factory and not a module reading `env`, for the same reason the tokens are:
 * two services resolve their environment at different moments, and a
 * module-level `import { env }` would make import order decide whether the URL
 * was known yet.
 */
export function createRedis({ url, logger }) {
  let client = null;

  const redisEnabled = () => Boolean(url);

  function connect(label) {
    const c = new Redis(url, {
      /*
       * A command issued before the socket is writable is queued and sent on
       * connect. The offline queue stays ON deliberately: rate-limit-redis
       * loads its Lua script inside its constructor, which runs at import
       * time, long before any connection exists. With the queue disabled that
       * command rejects immediately, nothing is listening for the rejection,
       * and the process dies on boot.
       *
       * The queue is not unbounded - maxRetriesPerRequest is what bounds it,
       * so a command fails rather than hanging when Redis is genuinely away.
       */
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
    c.on('error', (err) => logger.warn({ err, label }, 'redis error'));
    c.on('connect', () => logger.info({ label }, 'redis connected'));
    return c;
  }

  function getRedis() {
    if (!redisEnabled()) return null;
    if (!client) client = connect('main');
    return client;
  }

  /**
   * A second connection. The Socket.IO adapter needs one for publishing and
   * one for subscribing, because a client in subscriber mode may not issue
   * ordinary commands.
   *
   * `maxRetriesPerRequest: null` here, deliberately different from the shared
   * connection above, and the difference is the point.
   *
   * On the main connection a bounded queue is right: the cache is on the
   * request path, so a command should fail fast and be treated as a miss
   * rather than making someone wait for a Redis that is not coming back.
   *
   * These two are not on the request path. The only commands they carry are
   * the adapter's SUBSCRIBE and the pub/sub traffic behind an emit, and
   * nothing is awaiting either. With a bound, ioredis eventually gives up and
   * calls flushQueue, which rejects every queued command - including the
   * SUBSCRIBE that @socket.io/redis-adapter issued and never attached a
   * handler to. That is an unhandled rejection, and Node's answer to an
   * unhandled rejection is to exit, so a Redis outage killed the whole API
   * about thirty seconds in. The portal had already logged "server listening"
   * and was serving requests perfectly well at the time.
   *
   * Unbounded, those commands wait for the connection instead of rejecting,
   * and run when Redis comes back. Queueing a subscribe until the broker
   * returns is what you want anyway; the bound was only ever protecting the
   * request path.
   */
  function duplicateRedis(label) {
    const base = getRedis();
    if (!base) return null;
    return base
      .duplicate({ maxRetriesPerRequest: null })
      .on('error', (err) => logger.warn({ err, label }, 'redis error'));
  }

  /**
   * The store behind a rate limiter, shared across replicas when Redis is
   * configured and the library's in-process default when it is not.
   *
   * Without a shared store each replica sees roughly half the traffic, so the
   * effective limit doubles with every container added. A limit that relaxes
   * as you scale is not a limit - which is as true of the auth service's login
   * limiter as it was of the API's.
   *
   * Where Redis is configured the store is wrapped so that losing Redis
   * degrades the limit to a per-process one instead of failing the request.
   * Both ends of that are deliberate and the reasoning is in
   * `rateLimitStore.js`.
   *
   * `prefix` keeps two limiters from sharing a bucket.
   */
  function createRateLimitStore(prefix) {
    if (!redisEnabled()) return undefined; // memory, the library's default
    const store = new RedisStore({
      prefix,
      sendCommand: (...args) => getRedis().call(...args),
    });

    /*
     * RedisStore's constructor fires `SCRIPT LOAD` for both of its Lua scripts
     * and keeps the *unawaited* promises in these two fields. If Redis is not
     * reachable yet, they reject with nothing listening - an unhandled
     * rejection, which Node turns into process exit. Kubernetes starts pods in
     * parallel, so a pod scheduled before Redis is ready used to die on boot
     * and sit in CrashLoopBackOff. Compose never showed this because
     * `depends_on: service_healthy` meant Redis was always up first.
     *
     * That was a real violation of the rule that Redis is optional and a Redis
     * failure is a miss or a warning, never a failed request. A crash on boot
     * is the loudest possible version of it.
     *
     * Observing the rejection is the whole fix. The library already recovers
     * on its own: `retryableIncrement` awaits this promise inside a try, and
     * on a rejection reloads the script and retries - so the first request
     * after Redis appears repairs the store. All that was missing was a
     * handler, so the process lives long enough to get there. Note `.catch`
     * attaches to the original promise rather than replacing the field, which
     * is what keeps that retry path intact.
     */
    for (const field of ['incrementScriptSha', 'getScriptSha']) {
      const pending = store[field];
      if (typeof pending?.catch === 'function') {
        pending.catch((err) => logger.warn({ err, prefix }, 'rate limit script load deferred'));
      }
    }

    /*
     * Wrapped, because surviving boot was only half of that rule.
     *
     * The fix above keeps the process alive when Redis is late. It does
     * nothing for a Redis that goes away while the service is serving: the
     * store's command then rejects once `maxRetriesPerRequest` is spent, and
     * express-rate-limit turns a rejected store into a rejected *request* - a
     * 500 on somebody's login. Measured, against a dead port, before this
     * wrapper existed.
     *
     * So the rule that a Redis failure is a miss or a warning and never a
     * failed request was true of the cache and false here. The wrapper makes
     * it true of both, by degrading to the per-process counter rather than by
     * waving the request through unlimited - see rateLimitStore.js for why
     * that distinction is the whole point.
     */
    return new FallbackRateLimitStore({
      primary: store,
      prefix,
      logger,
      // ioredis already knows whether it has a usable connection, and reading
      // that is free where issuing a doomed command costs the full retry
      // budget - measured at ~15s per request against a dead port, which is
      // long enough for the limiter's own window to expire underneath it.
      isReady: () => getRedis()?.status === 'ready',
    });
  }

  async function closeRedis() {
    if (client) await client.quit().catch(() => {});
    client = null;
  }

  return { redisEnabled, getRedis, duplicateRedis, createRateLimitStore, closeRedis };
}
