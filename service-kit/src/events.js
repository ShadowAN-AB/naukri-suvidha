import mongoose from 'mongoose';

/**
 * The event contract: the four things a publisher and a consumer in different
 * processes must agree on, letter for letter.
 *
 * Everything else about the bus stays in the service that owns it, and
 * deliberately so. The API both publishes and consumes, on an in-process
 * EventEmitter when there is no broker, with an outbox on the publish side;
 * the notifications service only ever consumes, and only from Kafka. Those are
 * different jobs and they want different code. What they cannot have is
 * different *names* - a producer writing to `application.status_changed` and a
 * consumer subscribing to `application.statusChanged` is a silence, not an
 * error, and nothing fails until someone asks why they were never told.
 */

/** Domain events. The name is also the Kafka topic. */
export const EVENTS = Object.freeze({
  RESUME_UPLOADED: 'resume.uploaded',
  RESUME_PROCESSED: 'resume.processed',
  JOB_CREATED: 'job.created',
  JOB_APPROVED: 'job.approved',
  APPLICATION_SUBMITTED: 'application.submitted',
  APPLICATION_STATUS_CHANGED: 'application.status_changed',
  INTERVIEW_SCHEDULED: 'interview.scheduled',
});

export const EVENT_DELIVERY_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  /** Out of attempts. The dead-letter end of the queue. */
  DEAD: 'dead',
});
export const EVENT_DELIVERY_STATUS_VALUES = Object.values(EVENT_DELIVERY_STATUS);

/**
 * A named subscriber's Kafka consumer group.
 *
 * One group per subscriber is what makes two modules listening to the same
 * event each get their own copy rather than competing for it. Kafka group ids
 * may not carry a colon, which the handler names use as a separator, so the
 * substitution is the whole function - and it has to be the same substitution
 * in both processes, or a restarted consumer rejoins under a new name and
 * replays or skips depending on where that group's offsets happen to be.
 */
export const groupIdFor = (handlerName) => handlerName.replace(/:/g, '.');

/** Attempts before a delivery is left for someone to look at. */
export const MAX_DELIVERY_ATTEMPTS = 5;

const BASE_MS = 5_000;
const CEILING_MS = 10 * 60_000;

/**
 * Exponential, capped: 10s, 20s, 40s, 80s, 160s.
 *
 * A notification that failed because Mongo blinked wants the first retry
 * quickly; one failing because of a bug wants the gaps to widen rather than
 * spin. The cap keeps the last attempt inside ten minutes either way.
 */
export function backoffFrom(attempts) {
  const delay = Math.min(BASE_MS * 2 ** attempts, CEILING_MS);
  return new Date(Date.now() + delay);
}

/**
 * A handler that threw, kept so it can be tried again.
 *
 * Delivery itself stays synchronous - the fast path writes nothing. A row
 * appears only when a handler fails, which is the case that used to be logged
 * and forgotten: a student moved to `shortlisted` and never told, with nothing
 * anywhere to say the side effect had not happened.
 *
 * A *schema*, not a model, for the reason the auth service's schemas.js
 * records: `mongoose.model` registers on a connection and building its indexes
 * creates the collection, so a module that registers on import decides which
 * database the collection lands in. Each service registers this on its own.
 *
 * Shared because each service retries its own failures in its own database and
 * the shape has to match - the same worker logic reads it, and the
 * `nextAttemptAt` the claim filters on is the fix for a hot loop that a test
 * caught once.
 */
export const eventDeliverySchema = new mongoose.Schema(
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
