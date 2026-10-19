import { io } from 'socket.io-client';
import { getAccessToken } from './api.js';

/**
 * One socket for the whole app.
 *
 * It carries the same access token the API uses, so the server applies the
 * same checks to a channel as to a request. Because that token expires, the
 * token is read fresh on every connection attempt rather than captured once -
 * otherwise a reconnect after an expiry would retry forever with a dead
 * credential.
 */
let socket = null;

export function connectSocket() {
  if (socket?.connected) return socket;

  socket?.close();
  socket = io({
    // Same origin: Vite proxies it in development, and in production the API
    // serves it from the same host.
    path: '/socket.io',
    transports: ['websocket'],
    auth: (cb) => cb({ token: getAccessToken() }),
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  return socket;
}

export function disconnectSocket() {
  socket?.close();
  socket = null;
}

export function getSocket() {
  return socket;
}
