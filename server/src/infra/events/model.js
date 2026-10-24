import mongoose from 'mongoose';
import {
  EVENT_DELIVERY_STATUS,
  EVENT_DELIVERY_STATUS_VALUES,
  OUTBOX_STATUS,
  OUTBOX_STATUS_VALUES,
} from '../../lib/constants.js';

/**
 * A handler that threw, kept so it can be tried again.
 *
 * Delivery itself stays in-process and synchronous — the fast path writes
 * nothing. A row appears only when a handler fails, which is the case that
 * used to be logged and forgotten: a student moved to `shortlisted` and never
 * told, with nothing anywhere to say the side effect had not happened.
 *
 * This is the *consume* side. The publish side is `OutboxEvent` below: the
 * two cover different failures and neither replaces the other. A row here
 * means a handler ran and threw; a row there means an event was committed and
 * has not reached the bus yet.
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

/**
 * An event committed with the write that caused it, waiting to be published.
 *
 * This is the half of the problem Kafka could not solve on its own. Producing
 * after the database write leaves a window: a process that dies in between
 * has committed the business row and lost the event, and nothing redelivers
 * it because the broker never heard of it.
 *
 * Writing the event *inside the same transaction* as the row removes the
 * window, because now there is no in-between — either both land or neither
 * does. The cost is that publishing becomes asynchronous: a committed row is
 * an intent, and `outboxWorker` is what turns intents into published events.
 *
 * Needs a replica set. Where there is none, `withTransaction` runs without a
 * session and the bus publishes directly, so nothing is written here at all.
 */
const outboxEventSchema = new mongoose.Schema(
  {
    event: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    status: {
      type: String,
      enum: OUTBOX_STATUS_VALUES,
      default: OUTBOX_STATUS.PENDING,
    },
    attempts: { type: Number, default: 0 },
    publishedAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true },
);

/*
 * The worker's only query, and the order matters: oldest first, so events
 * about one record reach the bus in the order they were committed. Without
 * the sort a notification could describe a status change that, to any
 * consumer, had not happened yet.
 */
outboxEventSchema.index({ status: 1, createdAt: 1 });

export const OutboxEvent = mongoose.model('OutboxEvent', outboxEventSchema);
