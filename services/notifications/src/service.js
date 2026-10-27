import { AppError } from '@naukri-suvidha/service-kit';

import { logger } from './logger.js';
import { emitToUser, SOCKET_EVENTS } from './sockets.js';
import { Notification } from './model.js';

/**
 * Writes a notification and pushes it to any tab that user has open.
 *
 * The database row is what matters; the socket emit is a nicety. A user with
 * no tab open still finds it in their inbox next time they sign in, which is
 * why the write happens first and the emit is never awaited for correctness -
 * and why the emit going nowhere, because Redis is absent, is a warning rather
 * than an error.
 */
export async function notify({ userId, type, title, body, link }) {
  if (!userId) {
    // Nothing to tell. This means an event arrived without its audience,
    // which is a publisher bug rather than a missing user - the payload is
    // supposed to carry it. Worth a line, because the symptom otherwise is
    // simply that nobody was told.
    logger.warn({ type }, 'event carried no userId; nothing to notify');
    return null;
  }

  try {
    const notification = await Notification.create({ userId, type, title, body, link });
    emitToUser(String(userId), SOCKET_EVENTS.NOTIFICATION_NEW, {
      _id: String(notification._id),
      type,
      title,
      body,
      link,
      createdAt: notification.createdAt,
      readAt: null,
    });
    return notification;
  } catch (err) {
    // A failed notification must never fail the thing it was describing. The
    // handler's guard turns a throw into a retry row, so this logs and lets
    // the error through for that.
    logger.error({ err, type }, 'could not write notification');
    throw err;
  }
}

export async function listForUser(userId, { limit = 30 } = {}) {
  const [items, unread] = await Promise.all([
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ userId, readAt: null }),
  ]);
  return { items, unread };
}

export async function markRead(userId, id) {
  const updated = await Notification.findOneAndUpdate(
    { _id: id, userId, readAt: null },
    { $set: { readAt: new Date() } },
    { new: true },
  ).lean();
  if (!updated) throw AppError.notFound('That notification does not exist');
  return updated;
}

export async function markAllRead(userId) {
  const res = await Notification.updateMany(
    { userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return { marked: res.modifiedCount };
}
