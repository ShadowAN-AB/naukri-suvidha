/** Single source of truth for the enumerations the schemas and services share. */

export const ROLES = Object.freeze({
  STUDENT: 'student',
  RECRUITER: 'recruiter',
  ADMIN: 'admin',
});
export const ROLE_VALUES = Object.values(ROLES);

export const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
});
export const USER_STATUS_VALUES = Object.values(USER_STATUS);

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

/** Domain events published on the in-process bus. */
export const EVENTS = Object.freeze({
  RESUME_UPLOADED: 'resume.uploaded',
  RESUME_PROCESSED: 'resume.processed',
  JOB_CREATED: 'job.created',
  JOB_APPROVED: 'job.approved',
  APPLICATION_SUBMITTED: 'application.submitted',
  APPLICATION_STATUS_CHANGED: 'application.status_changed',
  INTERVIEW_SCHEDULED: 'interview.scheduled',
});
