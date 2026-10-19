import { AppError } from '../../middleware/error.js';
import { logger } from '../../config/logger.js';
import { emitToUser, SOCKET_EVENTS } from '../realtime/index.js';
import { Notification } from './model.js';

/**
 * Writes a notification and pushes it to any tab that user has open.
 *
 * The database row is what matters; the socket emit is a nicety. A user with
 * no tab open still finds it in their inbox next time they sign in, which is
 * why the write happens first and the emit is never awaited for correctness.
 */
export async function notify({ userId, type, title, body, link }) {
  if (!userId) return null;

  try {
    const notification = await Notification.create({ userId, type, title, body, link });
    const payload = {
      _id: String(notification._id),
      type,
      title,
      body,
      link,
      createdAt: notification.createdAt,
      readAt: null,
    };
    emitToUser(String(userId), SOCKET_EVENTS.NOTIFICATION_NEW, payload);
    return notification;
  } catch (err) {
    // A failed notification must never fail the thing it was describing.
    logger.error({ err, type }, 'could not write notification');
    return null;
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
