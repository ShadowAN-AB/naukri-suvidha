import mongoose from 'mongoose';
import { NOTIFICATION_TYPE_VALUES } from '../../lib/constants.js';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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
