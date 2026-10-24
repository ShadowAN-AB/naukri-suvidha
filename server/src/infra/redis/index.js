import Redis from 'ioredis';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * One connection, shared.
 *
 * Redis is optional on purpose. Without `REDIS_URL` the portal runs exactly
 * as it did: an in-process cache, a per-process rate limiter, sockets held in
 * one process. That is the single-instance story and it still has to work,
 * because `npm run dev` is not going to start a Redis.
 *
 * With it, the three things that could not survive a second replica start
 * working: a cache both replicas can see, one rate-limit counter between
 * them, and sockets that reach a user whichever replica holds the connection.
 */

let client = null;

export function redisEnabled() {
  return Boolean(env.REDIS_URL);
}

function connect(label) {
  const c = new Redis(env.REDIS_URL, {
    /*
     * A command issued before the socket is writable is queued and sent on
     * connect. The offline queue stays ON deliberately: rate-limit-redis
     * loads its Lua script inside its constructor, which runs at import time,
     * long before any connection exists. With the queue disabled that command
     * rejects immediately, nothing is listening for the rejection, and the
     * process dies on boot.
     *
     * The queue is not unbounded - maxRetriesPerRequest is what bounds it, so
     * a command fails rather than hanging when Redis is genuinely away.
     */
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });
  c.on('error', (err) => logger.warn({ err, label }, 'redis error'));
  c.on('connect', () => logger.info({ label }, 'redis connected'));
  return c;
}

export function getRedis() {
  if (!redisEnabled()) return null;
  if (!client) client = connect('main');
  return client;
}

/**
 * A second connection. The Socket.IO adapter needs one for publishing and one
 * for subscribing, because a client in subscriber mode may not issue ordinary
 * commands.
 *
 * `maxRetriesPerRequest: null` here, deliberately different from the shared
 * connection above, and the difference is the point.
 *
 * On the main connection a bounded queue is right: the cache is on the
 * request path, so a command should fail fast and be treated as a miss rather
 * than making someone wait for a Redis that is not coming back.
 *
 * These two are not on the request path. The only commands they carry are the
 * adapter's SUBSCRIBE and the pub/sub traffic behind an emit, and nothing is
 * awaiting either. With a bound, ioredis eventually gives up and calls
 * flushQueue, which rejects every queued command - including the SUBSCRIBE
 * that @socket.io/redis-adapter issued and never attached a handler to. That
 * is an unhandled rejection, and Node's answer to an unhandled rejection is
 * to exit, so a Redis outage killed the whole API about thirty seconds in.
 * The portal had already logged "server listening" and was serving requests
 * perfectly well at the time.
 *
 * Unbounded, those commands wait for the connection instead of rejecting, and
 * run when Redis comes back. Queueing a subscribe until the broker returns is
 * what you want anyway; the bound was only ever protecting the request path.
 */
export function duplicateRedis(label) {
  const base = getRedis();
  if (!base) return null;
  return base
    .duplicate({ maxRetriesPerRequest: null })
    .on('error', (err) => logger.warn({ err, label }, 'redis error'));
}

export async function closeRedis() {
  if (client) await client.quit().catch(() => {});
  client = null;
}
