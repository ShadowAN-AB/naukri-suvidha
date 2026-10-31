import mongoose from 'mongoose';
import { eventDeliverySchema } from '@naukri-suvidha/service-kit';

/**
 * One row per intended send - sent, failed or deliberately skipped.
 *
 * The `eventKey` is what makes a Kafka redelivery a no-op rather than a second
 * send. Kafka's at-least-once semantics are the price of its reliability, and
 * `services/notifications` handles it one way (handlers that are idempotent by
 * shape - writing a notification twice means two rows the inbox merges). This
 * service cannot be shaped that way: a second SMTP send is a second email in
 * the student's inbox, which is what the pinned prose of CLAUDE.md calls a
 * silent failure one layer up. So the handler short-circuits on an existing
 * eventKey before it even looks at the transport. The unique index enforces
 * that even if two processes raced the lookup.
 *
 * `originalTo` and `overrideApplied` exist together: the demo override rewrites
 * `to` at the transport layer, and the log row has to carry both so a reader
 * can tell what the system was told to do vs what the environment forced it
 * to do. Without this pair, a demo-time override would hide what the service
 * actually tried to send.
 */
const emailLogSchema = new mongoose.Schema(
  {
    event: { type: String, required: true },
    /** `interview:<interviewId>` - the key the unique index enforces. */
    eventKey: { type: String, required: true },

    to: { type: String, required: true },
    originalTo: { type: String, required: true },
    overrideApplied: { type: Boolean, default: false },

    subject: { type: String, required: true },

    status: {
      type: String,
      enum: ['sent', 'failed', 'skipped'],
      required: true,
    },
    attempts: { type: Number, default: 1 },
    messageId: { type: String },
    lastError: { type: String },

    sentAt: { type: Date },
  },
  { timestamps: true },
);

// A redelivery of the same event must find this and short-circuit.
emailLogSchema.index({ eventKey: 1 }, { unique: true });
// For the dashboard-ish "what happened lately" view, if ever added.
emailLogSchema.index({ createdAt: -1 });

export const EmailLog = mongoose.model('EmailLog', emailLogSchema);

/**
 * This service's own retry queue, from the shared schema.
 *
 * Each service retries its own failed deliveries in its own database - here
 * that means a handler that threw for a transient reason (auth unreachable,
 * mongo blinked), not an SMTP failure the EmailLog row already records.
 */
export const EventDelivery = mongoose.model('EventDelivery', eventDeliverySchema);
