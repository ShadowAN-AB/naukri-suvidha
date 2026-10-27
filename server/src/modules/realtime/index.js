import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { verifyAccessToken } from '../../lib/tokens.js';
import { introspectToken } from '../../infra/identity/authClient.js';
import { roomForUser } from '@naukri-suvidha/service-kit';
import { duplicateRedis, redisEnabled } from '../../infra/redis/index.js';

/*
 * Re-exported, not redefined. The notifications service emits two of these
 * from another process, through the Redis adapter into the rooms this gateway
 * holds, so the names and the room format are a contract rather than a local
 * convention.
 */
export { SOCKET_EVENTS } from '@naukri-suvidha/service-kit';

let io = null;

const roomFor = roomForUser;

/**
 * Socket.IO rides on the same HTTP server as the API, so there is one process
 * and one port to deploy.
 *
 * A socket is authenticated the same way a request is, but it cannot be
 * authenticated in the same *place*. A Socket.IO handshake carries its token
 * in the connection payload rather than an Authorization header, and the edge
 * proxies /socket.io straight through - there is no `auth_request` on a
 * websocket upgrade. So this is the one entry point in the system that the
 * gateway cannot cover, and it introspects against the auth service itself to
 * get the same answer the edge would have got.
 *
 * Each connection joins exactly one room - its own - which is what keeps one
 * student from subscribing to another's events.
 */
export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
    path: '/socket.io',
  });

  /*
   * Without this, a second replica breaks realtime in a way that looks like
   * nothing is wrong: a student's socket is held by one container and the
   * event meant for them is emitted on another, so the push silently never
   * arrives. The adapter puts the emit on Redis pub/sub so every replica
   * delivers to whatever sockets it holds.
   *
   * Two connections, because a client in subscriber mode cannot issue
   * ordinary commands.
   */
  if (redisEnabled()) {
    io.adapter(createAdapter(duplicateRedis('socket-pub'), duplicateRedis('socket-sub')));
    logger.info('realtime using the redis adapter');
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
       * signature here is all that can be done and all that was ever done.
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
    socket.join(roomFor(userId));
    logger.debug({ userId, socketId: socket.id }, 'socket connected');

    socket.on('disconnect', (reason) => {
      logger.debug({ userId, reason }, 'socket disconnected');
    });
  });

  logger.info('realtime gateway ready');
  return io;
}

/** No-ops when realtime is not running, so nothing depends on it being up. */
export function emitToUser(userId, event, payload) {
  if (!io) return false;
  io.to(roomFor(userId)).emit(event, payload);
  return true;
}

export function realtimeStats() {
  if (!io) return { up: false, sockets: 0 };
  return { up: true, sockets: io.engine?.clientsCount ?? 0 };
}

export async function closeRealtime() {
  if (io) await io.close();
  io = null;
}
