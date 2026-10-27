import { EVENTS } from '@naukri-suvidha/service-kit';

import { logger } from './logger.js';
import { NOTIFICATION_TYPE } from './constants.js';
import { emitToUser, SOCKET_EVENTS } from './sockets.js';
import { notify } from './service.js';
import { on } from './consumer.js';

/**
 * The only place that turns domain events into notifications.
 *
 * Nothing that publishes an event knows this file exists, which is the point
 * of the bus: `applications` records a status change and is done, and the fact
 * that a student gets told about it is this module's business.
 *
 * **Every handler here reads nothing but its event**, and in this service that
 * is not a style preference - it is the only thing that works. There are no
 * students, jobs or companies in this database. The handlers used to look all
 * three up, which was possible only while they shared a process with them; an
 * event that cannot be acted on without reading the publisher's data is not
 * really an event, it is a trigger to go and ask.
 *
 * So the publishers resolve the audience, in the services that own it, and the
 * payload carries it. That change landed before this service existed, which is
 * what made the extraction a move rather than a rewrite.
 */

const STATUS_COPY = {
  shortlisted: ['You have been shortlisted', 'Your application moved to shortlisted.'],
  interview: ['You are through to interview', 'Your application moved to the interview stage.'],
  offered: ['You have an offer', 'Congratulations - your application resulted in an offer.'],
  rejected: ['An application was not taken forward', 'This application has been closed.'],
  withdrawn: ['Application withdrawn', 'You withdrew this application.'],
};

export function registerConsumers() {
  // A posting going live is news for the recruiter who submitted it.
  on(EVENTS.JOB_APPROVED, 'notifications:job-approved', async ({ recruiterUserId, title }) => {
    await notify({
      userId: recruiterUserId,
      type: NOTIFICATION_TYPE.JOB_APPROVED,
      title: 'Your posting is live',
      body: `"${title ?? 'A job'}" was approved and is now visible to students.`,
      link: '/jobs',
    });
  });

  // A new applicant is news for the recruiter.
  on(
    EVENTS.APPLICATION_SUBMITTED,
    'notifications:application-submitted',
    async ({ recruiterUserId, jobTitle, studentName }) => {
      await notify({
        userId: recruiterUserId,
        type: NOTIFICATION_TYPE.APPLICATION_STATUS,
        title: 'New applicant',
        body: `${studentName ?? 'A student'} applied to "${jobTitle ?? 'your posting'}".`,
        link: '/applicants',
      });
    },
  );

  // A status change is news for the student, and also a live update.
  on(
    EVENTS.APPLICATION_STATUS_CHANGED,
    'notifications:application-status-changed',
    async ({ applicationId, jobId, status, jobTitle, studentUserId }) => {
      const [title, body] = STATUS_COPY[status] ?? ['Your application changed', `It is now ${status}.`];

      await notify({
        userId: studentUserId,
        type: NOTIFICATION_TYPE.APPLICATION_STATUS,
        title,
        body: `${body} (${jobTitle ?? 'a job'})`,
        link: '/applications',
      });

      if (studentUserId) {
        emitToUser(String(studentUserId), SOCKET_EVENTS.APPLICATION_STATUS, {
          applicationId: String(applicationId),
          jobId: String(jobId),
          jobTitle: jobTitle ?? null,
          status,
        });
      }
    },
  );

  // A parsed resume is news for the student, who has been waiting on it.
  on(
    EVENTS.RESUME_PROCESSED,
    'notifications:resume-processed',
    async ({ resumeId, fallback, studentUserId }) => {
      await notify({
        userId: studentUserId,
        type: NOTIFICATION_TYPE.RESUME_PROCESSED,
        title: fallback ? 'Résumé read, with limits' : 'Résumé processed',
        body: fallback
          ? 'We could only read your skills from it. Jobs are being ranked with what we have.'
          : 'Your profile has been built from it and your jobs are being ranked.',
        link: '/resume',
      });

      if (studentUserId) {
        emitToUser(String(studentUserId), SOCKET_EVENTS.RESUME_PROCESSED, {
          resumeId: String(resumeId),
          fallback: Boolean(fallback),
        });
      }
    },
  );

  // A scheduled interview is news for the student.
  on(
    EVENTS.INTERVIEW_SCHEDULED,
    'notifications:interview-scheduled',
    async ({ scheduledAt, mode, jobTitle, studentUserId }) => {
      await notify({
        userId: studentUserId,
        type: NOTIFICATION_TYPE.INTERVIEW_SCHEDULED,
        title: 'Interview scheduled',
        body: `${mode} interview for "${jobTitle ?? 'a job'}" on ${new Date(scheduledAt).toLocaleString()}.`,
        link: '/applications',
      });
    },
  );

  logger.info('notification handlers registered');
}
