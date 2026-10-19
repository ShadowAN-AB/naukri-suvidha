import { Server } from 'socket.io';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { verifyAccessToken } from '../../lib/tokens.js';
import { User } from '../auth/model.js';
import { USER_STATUS } from '../../lib/constants.js';

/** The three events the client listens for, all scoped to one user's room. */
export const SOCKET_EVENTS = Object.freeze({
  NOTIFICATION_NEW: 'notification:new',
  APPLICATION_STATUS: 'application:status',
  RESUME_PROCESSED: 'resume:processed',
});

let io = null;

const roomFor = (userId) => `user:${userId}`;

/**
 * Socket.IO rides on the same HTTP server as the API, so there is one process
 * and one port to deploy.
 *
 * A socket is authenticated the same way a request is: the access token is
 * verified and the user re-checked against the database, so a suspended
 * account or an ended session cannot hold an open channel. Each connection
 * joins exactly one room - its own - which is what keeps one student from
 * subscribing to another's events.
 */
export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
    path: '/socket.io',
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Missing access token'));

      const claims = verifyAccessToken(token);
      const user = await User.findById(claims.sub).lean();
      if (!user) return next(new Error('Account no longer exists'));
      if (user.status !== USER_STATUS.ACTIVE) return next(new Error('Account is suspended'));
      if ((user.tokenVersion ?? 0) !== (claims.v ?? 0)) return next(new Error('Session ended'));

      socket.data.userId = String(user._id);
      socket.data.role = user.role;
      next();
    } catch (err) {
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
