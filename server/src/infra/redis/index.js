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
 */
export function duplicateRedis(label) {
  const base = getRedis();
  return base ? base.duplicate().on('error', (err) => logger.warn({ err, label }, 'redis error')) : null;
}

export async function closeRedis() {
  if (client) await client.quit().catch(() => {});
  client = null;
}
