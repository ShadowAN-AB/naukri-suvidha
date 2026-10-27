/**
 * The notification kinds, which belong to this service alone.
 *
 * They are *not* in service-kit, and the distinction is the rule that keeps
 * the kit from becoming a dumping ground: nothing else in the system reads or
 * writes a notification, so no other process can disagree about these. The
 * event names and the socket event names are shared; these are not.
 */
export const NOTIFICATION_TYPE = Object.freeze({
  JOB_APPROVED: 'job.approved',
  APPLICATION_STATUS: 'application.status',
  RESUME_PROCESSED: 'resume.processed',
  INTERVIEW_SCHEDULED: 'interview.scheduled',
});
export const NOTIFICATION_TYPE_VALUES = Object.values(NOTIFICATION_TYPE);
