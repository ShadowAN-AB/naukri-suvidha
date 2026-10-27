import { Emitter } from '@socket.io/redis-emitter';

import { SOCKET_EVENTS, roomForUser } from '@naukri-suvidha/service-kit';
import { getRedis, redisEnabled } from './redis.js';
import { logger } from './logger.js';

export { SOCKET_EVENTS };

/**
 * Pushing to a socket this process does not hold.
 *
 * This is the piece of the extraction that would have been impossible two
 * steps ago, and it is worth being precise about why it works now.
 *
 * The sockets live in the API: the client connects to `/socket.io`, which the
 * edge proxies there, and the API's Socket.IO server holds the connection and
 * puts it in a room. This service has no sockets at all. What it has is the
 * Redis adapter's channel - the same one the API's adapter subscribes to - so
 * an emit published here is delivered by whichever API replica holds that
 * user's connection.
 *
 * That adapter was added in step 2 to stop a second API replica silently
 * breaking realtime. The same mechanism now carries an emit across a *service*
 * boundary rather than a replica one, which is not a coincidence: both are the
 * same problem, which is that the process deciding to push is not the process
 * holding the socket.
 *
 * Without Redis there is no channel and no push. The notification row is still
 * written, which is the half that matters - a user with no tab open finds it in
 * their inbox either way - so this returns false rather than throwing.
 */
let emitter = null;

export function emitToUser(userId, event, payload) {
  if (!redisEnabled()) return false;

  if (!emitter) {
    // The emitter needs no subscription of its own; it only publishes. The
    // default key prefix matches @socket.io/redis-adapter's, which is what
    // makes the API's server pick these up - a mismatch there is a push that
    // vanishes with no error anywhere.
    emitter = new Emitter(getRedis());
    logger.info('socket emitter ready (pushing through the redis adapter)');
  }

  try {
    emitter.to(roomForUser(userId)).emit(event, payload);
    return true;
  } catch (err) {
    // A failed push is not a failed notification. The row is already written.
    logger.warn({ err, event }, 'could not push to sockets');
    return false;
  }
}
