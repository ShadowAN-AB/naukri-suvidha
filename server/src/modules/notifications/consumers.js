import { eventBus } from '../../infra/events/eventBus.js';
import { logger } from '../../config/logger.js';
import { EVENTS, NOTIFICATION_TYPE } from '../../lib/constants.js';
import { emitToUser, SOCKET_EVENTS } from '../realtime/index.js';
import { notify } from './service.js';
import { Student, Company } from '../profiles/model.js';
import { Job } from '../jobs/model.js';
import { Application } from '../applications/model.js';

/**
 * The only place that turns domain events into notifications.
 *
 * Nothing that publishes an event knows this file exists, which is the point
 * of the bus: `applications` records a status change and is done, and the fact
 * that a student gets told about it is this module's business.
 */

const userOfStudent = async (studentId) =>
  (await Student.findById(studentId).select('userId').lean())?.userId;

const userOfCompanyForJob = async (jobId) => {
  const job = await Job.findById(jobId).select('companyId title').lean();
  if (!job) return { userId: null, job: null };
  const company = await Company.findById(job.companyId).select('userId name').lean();
  return { userId: company?.userId, job, company };
};

const STATUS_COPY = {
  shortlisted: ['You have been shortlisted', 'Your application moved to shortlisted.'],
  interview: ['You are through to interview', 'Your application moved to the interview stage.'],
  offered: ['You have an offer', 'Congratulations - your application resulted in an offer.'],
  rejected: ['An application was not taken forward', 'This application has been closed.'],
  withdrawn: ['Application withdrawn', 'You withdrew this application.'],
};

export function registerNotificationConsumers() {
  // A posting going live is news for the recruiter who submitted it.
  eventBus.subscribe(EVENTS.JOB_APPROVED, async ({ jobId }) => {
    const { userId, job } = await userOfCompanyForJob(jobId);
    await notify({
      userId,
      type: NOTIFICATION_TYPE.JOB_APPROVED,
      title: 'Your posting is live',
      body: `"${job?.title ?? 'A job'}" was approved and is now visible to students.`,
      link: '/jobs',
    });
  });

  // A new applicant is news for the recruiter.
  eventBus.subscribe(EVENTS.APPLICATION_SUBMITTED, async ({ jobId, studentId }) => {
    const [{ userId, job }, student] = await Promise.all([
      userOfCompanyForJob(jobId),
      Student.findById(studentId).select('name rollNo').lean(),
    ]);
    await notify({
      userId,
      type: NOTIFICATION_TYPE.APPLICATION_STATUS,
      title: 'New applicant',
      body: `${student?.name ?? 'A student'} applied to "${job?.title ?? 'your posting'}".`,
      link: '/applicants',
    });
  });

  // A status change is news for the student, and also a live update.
  eventBus.subscribe(EVENTS.APPLICATION_STATUS_CHANGED, async ({ applicationId, studentId, jobId, status }) => {
    const [userId, job] = await Promise.all([
      userOfStudent(studentId),
      Job.findById(jobId).select('title').lean(),
    ]);
    const [title, body] = STATUS_COPY[status] ?? ['Your application changed', `It is now ${status}.`];

    await notify({
      userId,
      type: NOTIFICATION_TYPE.APPLICATION_STATUS,
      title,
      body: `${body} (${job?.title ?? 'a job'})`,
      link: '/applications',
    });

    if (userId) {
      emitToUser(String(userId), SOCKET_EVENTS.APPLICATION_STATUS, {
        applicationId: String(applicationId),
        jobId: String(jobId),
        jobTitle: job?.title ?? null,
        status,
      });
    }
  });

  // A parsed resume is news for the student, who has been waiting on it.
  eventBus.subscribe(EVENTS.RESUME_PROCESSED, async ({ resumeId, studentId, fallback }) => {
    const userId = await userOfStudent(studentId);
    await notify({
      userId,
      type: NOTIFICATION_TYPE.RESUME_PROCESSED,
      title: fallback ? 'Résumé read, with limits' : 'Résumé processed',
      body: fallback
        ? 'We could only read your skills from it. Jobs are being ranked with what we have.'
        : 'Your profile has been built from it and your jobs are being ranked.',
      link: '/resume',
    });

    if (userId) {
      emitToUser(String(userId), SOCKET_EVENTS.RESUME_PROCESSED, {
        resumeId: String(resumeId),
        fallback: Boolean(fallback),
      });
    }
  });

  // A scheduled interview is news for the student.
  eventBus.subscribe(EVENTS.INTERVIEW_SCHEDULED, async ({ applicationId, scheduledAt, mode }) => {
    const application = await Application.findById(applicationId).select('studentId jobId').lean();
    if (!application) return;
    const [userId, job] = await Promise.all([
      userOfStudent(application.studentId),
      Job.findById(application.jobId).select('title').lean(),
    ]);
    await notify({
      userId,
      type: NOTIFICATION_TYPE.INTERVIEW_SCHEDULED,
      title: 'Interview scheduled',
      body: `${mode} interview for "${job?.title ?? 'a job'}" on ${new Date(scheduledAt).toLocaleString()}.`,
      link: '/applications',
    });
  });

  logger.info('notification consumers registered');
}
