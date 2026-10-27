import mongoose from 'mongoose';
import { eventDeliverySchema } from '@naukri-suvidha/service-kit';
import { NOTIFICATION_TYPE_VALUES } from './constants.js';

const notificationSchema = new mongoose.Schema(
  {
    /*
     * No `ref`. It names a user in the auth service's database, and this
     * process has no connection that could reach it - a `.populate()` would
     * throw MissingSchemaError at runtime rather than failing to compile,
     * which is exactly how the admin audit screen broke.
     */
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: NOTIFICATION_TYPE_VALUES, required: true },
    title: { type: String, required: true },
    body: { type: String },
    link: { type: String },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The inbox query is "this user's newest first", plus an unread count.
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });

export const Notification = mongoose.model('Notification', notificationSchema);

/**
 * This service's own retry queue, from the shared schema.
 *
 * Each service retries its own failed deliveries in its own database. A row
 * here means one of the handlers below threw - mongo blinked, or there is a
 * bug - and the worker will try it again on the shared backoff curve.
 */
export const EventDelivery = mongoose.model('EventDelivery', eventDeliverySchema);
