/** Single source of truth for the enumerations the schemas and services share. */

export const ROLES = Object.freeze({
  STUDENT: 'student',
  RECRUITER: 'recruiter',
  ADMIN: 'admin',
});
export const ROLE_VALUES = Object.values(ROLES);

/*
 * Re-exported, not redefined. Both this service and the auth service branch
 * on a user's status, and the auth service is the one that writes it - so two
 * copies of these strings would be two opinions about what "suspended" is
 * spelt like, and the disagreement would show up as a suspended account that
 * one service still lets in.
 */
export { USER_STATUS, USER_STATUS_VALUES } from '@naukri-suvidha/service-kit';

export const PLACEMENT_STATUS = Object.freeze({
  UNPLACED: 'unplaced',
  PLACED: 'placed',
  OPTED_OUT: 'opted_out',
});
export const PLACEMENT_STATUS_VALUES = Object.values(PLACEMENT_STATUS);

/** A job is invisible to students until an admin approves it. */
export const JOB_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CLOSED: 'closed',
});
export const JOB_STATUS_VALUES = Object.values(JOB_STATUS);

/** The application pipeline, in order. */
export const APPLICATION_STATUS = Object.freeze({
  APPLIED: 'applied',
  SHORTLISTED: 'shortlisted',
  INTERVIEW: 'interview',
  OFFERED: 'offered',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
});
export const APPLICATION_STATUS_VALUES = Object.values(APPLICATION_STATUS);

export const PARSE_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  DONE: 'done',
  FAILED: 'failed',
  MANUAL: 'manual',
});
export const PARSE_STATUS_VALUES = Object.values(PARSE_STATUS);

export const AI_TASK_TYPE = Object.freeze({
  EXTRACT_RESUME: 'extract_resume',
  SCORE_FIT: 'score_fit',
  EMBED_RESUME: 'embed_resume',
});
export const AI_TASK_TYPE_VALUES = Object.values(AI_TASK_TYPE);

export const AI_TASK_STATUS = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
  DEAD: 'dead',
});
export const AI_TASK_STATUS_VALUES = Object.values(AI_TASK_STATUS);

export const INTERVIEW_MODE = Object.freeze({
  ONLINE: 'online',
  ONSITE: 'onsite',
  PHONE: 'phone',
});
export const INTERVIEW_MODE_VALUES = Object.values(INTERVIEW_MODE);

export const INTERVIEW_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
});
export const INTERVIEW_STATUS_VALUES = Object.values(INTERVIEW_STATUS);

export const NOTIFICATION_TYPE = Object.freeze({
  JOB_APPROVED: 'job.approved',
  APPLICATION_STATUS: 'application.status',
  RESUME_PROCESSED: 'resume.processed',
  INTERVIEW_SCHEDULED: 'interview.scheduled',
});
export const NOTIFICATION_TYPE_VALUES = Object.values(NOTIFICATION_TYPE);

/*
 * Re-exported, not redefined. The event name is the Kafka topic, so it is a
 * contract between this service's producer and the notifications service's
 * consumer - two copies of these strings is a subscription to a topic nobody
 * writes to, which fails silently.
 */
export { EVENTS } from '@naukri-suvidha/service-kit';

export const OUTBOX_STATUS = Object.freeze({
  PENDING: 'pending',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
});
export const OUTBOX_STATUS_VALUES = Object.values(OUTBOX_STATUS);

// Shared for the same reason: both services keep their own retry queue, and
// the same worker logic reads both.
export { EVENT_DELIVERY_STATUS, EVENT_DELIVERY_STATUS_VALUES } from '@naukri-suvidha/service-kit';
