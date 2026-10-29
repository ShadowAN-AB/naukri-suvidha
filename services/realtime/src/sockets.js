import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';

import { roomForUser } from '@naukri-suvidha/service-kit';

import { env } from './env.js';
import { logger } from './logger.js';
import { verifyAccessToken } from './tokens.js';
import { introspectToken } from './identity.js';
import { duplicateRedis, redisEnabled } from './redis.js';

/*
 * Re-exported, not redefined. The API and the notifications service both emit
 * into the rooms this service holds, from other processes, so the event names
 * and the room format are a contract rather than a local convention.
 */
export { SOCKET_EVENTS } from '@naukri-suvidha/service-kit';

let io = null;

/**
 * The socket gateway, now a service of its own.
 *
 * It used to ride on the API's HTTP server, on the stated grounds that there
 * was then one process and one port to deploy. That reasoning was sound and is
 * simply no longer what the project wants.
 *
 * What the extraction changes is which process owns a connection, and that is
 * a smaller change than it looks, because the Redis adapter had already made
 * the owner irrelevant to the publisher. The notifications service has been
 * pushing into rooms it does not hold since step 5b; the API now does the same
 * thing by the same route. Nothing had to learn a new mechanism - the
 * mechanism was built in step 2 to survive a second API replica, and it turned
 * out to be exactly what surviving a service boundary needs.
 *
 * One consequence worth being precise about: **this service scales on
 * connections, not requests.** A socket is held for as long as a tab is open,
 * so the resource is file descriptors and memory rather than CPU, and an
 * autoscaler driven by CPU would be reading the wrong signal entirely. That is
 * why it is a fixed replica count.
 */
export function initSockets(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
    path: '/socket.io',
  });

  /*
   * Load-bearing here in a way it was not in the API.
   *
   * In the monolith the adapter existed so a second *replica* could not
   * silently break realtime - one container held the socket and another
   * emitted the event. The same wiring now carries every push across a
   * *service* boundary, because no publisher is in this process at all. So
   * without Redis this service still accepts connections and still delivers
   * nothing, and `/health` has to say so rather than let an empty notification
   * list be the only symptom.
   */
  if (redisEnabled()) {
    io.adapter(createAdapter(duplicateRedis('socket-pub'), duplicateRedis('socket-sub')));
    logger.info('realtime using the redis adapter');
  } else {
    logger.warn('no REDIS_URL: pushes from the API and notifications cannot arrive');
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Missing access token'));

      /*
       * The auth service checks the signature *and* the row, so a suspended
       * account or an ended session cannot hold an open channel - which
       * matters more here than on a request, because a socket outlives the
       * moment it was opened.
       *
       * It returns null only when there is no auth service configured, which
       * is bearer mode: a single-process development run, where verifying the
       * signature here is all that can be done.
       */
      let user = await introspectToken(token);
      if (!user) {
        const claims = verifyAccessToken(token);
        user = { id: String(claims.sub), role: claims.role };
      }

      socket.data.userId = user.id;
      socket.data.role = user.role;
      next();
    } catch (err) {
      // AppError from the auth service carries a usable message; a jwt error
      // does not, so it is translated the way it always was.
      if (err.name === 'AppError') return next(new Error(err.message));
      next(new Error(err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    // Exactly one room per connection - its own - which is what keeps one
    // student from subscribing to another's events.
    socket.join(roomForUser(userId));
    logger.debug({ userId, socketId: socket.id }, 'socket connected');

    socket.on('disconnect', (reason) => {
      logger.debug({ userId, reason }, 'socket disconnected');
    });
  });

  logger.info('realtime gateway ready');
  return io;
}

/**
 * Kept, although nothing in this service calls it.
 *
 * Every push now originates in another process and arrives through the
 * adapter, so there is no local emit on any path. This is here for a local
 * emit from a future route in this service, and because deleting it would
 * make the room format implicit - `roomForUser` is the contract the other
 * services publish against.
 */
export function emitToUser(userId, event, payload) {
  if (!io) return false;
  io.to(roomForUser(userId)).emit(event, payload);
  return true;
}

export function socketStats() {
  if (!io) return { up: false, sockets: 0 };
  return { up: true, sockets: io.engine?.clientsCount ?? 0 };
}

export async function closeSockets() {
  if (io) await io.close();
  io = null;
}
