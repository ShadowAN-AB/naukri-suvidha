import mongoose from 'mongoose';
import { NOTIFICATION_TYPE_VALUES } from '../../lib/constants.js';

const notificationSchema = new mongoose.Schema(
  {
    /*
     * No `ref` on this id, deliberately. It names a user in the auth service's
     * database, which this process has no connection to - so a `.populate()` on
     * it throws MissingSchemaError at runtime rather than failing to compile.
     * That is exactly how the admin audit screen broke after the extraction.
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
