import mongoose from 'mongoose';
import { EVENT_DELIVERY_STATUS, EVENT_DELIVERY_STATUS_VALUES } from '../../lib/constants.js';

/**
 * A handler that threw, kept so it can be tried again.
 *
 * Delivery itself stays in-process and synchronous — the fast path writes
 * nothing. A row appears only when a handler fails, which is the case that
 * used to be logged and forgotten: a student moved to `shortlisted` and never
 * told, with nothing anywhere to say the side effect had not happened.
 *
 * What this is not: an outbox. A crash between publishing and running a
 * handler still loses that delivery, because nothing was written yet. Closing
 * that needs the write to happen on publish, which is the broker in §7 of the
 * system design. The window is microseconds; a handler that throws is not.
 */
const eventDeliverySchema = new mongoose.Schema(
  {
    event: { type: String, required: true },
    /** Which subscriber failed. Names are how a retry finds it again. */
    handler: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    attempts: { type: Number, default: 0 },
    status: {
      type: String,
      enum: EVENT_DELIVERY_STATUS_VALUES,
      default: EVENT_DELIVERY_STATUS.PENDING,
    },
    nextAttemptAt: { type: Date, default: Date.now },
    lastError: { type: String },
  },
  { timestamps: true },
);

// The worker's only query: what is due.
eventDeliverySchema.index({ status: 1, nextAttemptAt: 1 });

export const EventDelivery = mongoose.model('EventDelivery', eventDeliverySchema);
