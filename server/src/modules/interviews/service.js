import { AppError } from '../../middleware/error.js';
import { logger } from '../../config/logger.js';
import { eventBus } from '../../infra/events/eventBus.js';
import { withTransaction } from '../../infra/events/transactions.js';
import { EVENTS, INTERVIEW_STATUS, ROLES } from '../../lib/constants.js';
import { Interview } from './model.js';
import { Application } from '../applications/model.js';
import { Job } from '../jobs/model.js';
import { Student, Company } from '../profiles/model.js';
import { AuditLog } from '../admin/model.js';

/*
 * Takes the whole actor, not just an id. The audit row stores the email and
 * role alongside the id because `users` is the auth service's now and cannot
 * be joined to from here - see the comment on actorId in the admin model.
 *
 * `email` is empty in bearer mode, where the identity comes from the access
 * token and the token deliberately does not carry a mutable field. In gateway
 * mode - both container stacks - the edge forwards it, so the deployed
 * system records it and the screen falls back to the id where it does not.
 */
async function audit(actor, action, entityId, ip, meta) {
  try {
    await AuditLog.create({
      actorId: actor.id,
      actorEmail: actor.email || undefined,
      actorRole: actor.role,
      action,
      entity: 'Interview',
      entityId,
      ip,
      meta,
    });
  } catch (err) {
    logger.error({ err, action }, 'audit write failed');
  }
}

/**
 * Who an interview event should reach, and the job's title for the message.
 *
 * Both are resolved here because this service owns applications, students and
 * jobs; the notifications service owns none of them and has its own database,
 * so an event that did not carry this would arrive unactionable. The same
 * reasoning is written out once in jobs.approveJob.
 */
async function audienceFor(application) {
  const [student, job] = await Promise.all([
    Student.findById(application.studentId).select('userId').lean(),
    Job.findById(application.jobId).select('title').lean(),
  ]);
  return {
    studentUserId: student?.userId ? String(student.userId) : null,
    jobTitle: job?.title ?? null,
  };
}

/** The application, confirmed to belong to a job this recruiter owns. */
async function applicationForRecruiter(user, applicationId) {
  const application = await Application.findById(applicationId).lean();
  if (!application) throw AppError.notFound('That application does not exist');

  if (user.role === ROLES.RECRUITER) {
    const company = await Company.findOne({ userId: user.id }).lean();
    const job = await Job.findById(application.jobId).lean();
    if (!company || !job || String(job.companyId) !== String(company._id)) {
      throw AppError.forbidden('That application is for another company’s job');
    }
  }
  return application;
}

/**
 * A student cannot be in two places at once.
 *
 * Interviews carry an application rather than a student, so the student's
 * applications are resolved first. The overlap itself is computed in the
 * query, where each row's own duration is available - fetching a window and
 * filtering in memory would have to guess how long the longest interview is.
 *
 * This is a check before a write, so two recruiters booking the same instant
 * can both pass it. The unique index closes that race when it is the same
 * application; across two applications a narrow window remains, and closing it
 * properly needs a lock this single process does not have. Recorded in the
 * system design document under the same heading.
 */
async function assertSlotIsFree(studentId, start, durationMinutes, excludeInterviewId) {
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  const applications = await Application.find({ studentId }).select('_id').lean();
  if (applications.length === 0) return;

  const clash = await Interview.findOne({
    applicationId: { $in: applications.map((a) => a._id) },
    status: INTERVIEW_STATUS.SCHEDULED,
    ...(excludeInterviewId ? { _id: { $ne: excludeInterviewId } } : {}),
    // Two ranges overlap when each starts before the other ends.
    $expr: {
      $and: [
        { $lt: ['$scheduledAt', end] },
        {
          $gt: [
            { $add: ['$scheduledAt', { $multiply: ['$durationMinutes', 60_000] }] },
            start,
          ],
        },
      ],
    },
  }).lean();

  if (clash) {
    throw AppError.conflict('That student already has an interview overlapping this slot', {
      scheduledAt: `Clashes with an interview already booked for ${new Date(
        clash.scheduledAt,
      ).toUTCString()}`,
    });
  }
}

export async function schedule(user, input, ip) {
  const application = await applicationForRecruiter(user, input.applicationId);

  // Interviewing someone who was rejected or withdrew is a mistake, not a
  // feature, so the pipeline state gates it.
  if (!['shortlisted', 'interview'].includes(application.status)) {
    throw AppError.conflict(
      `An interview can only be scheduled for a shortlisted applicant. This one is ${application.status}.`,
    );
  }

  await assertSlotIsFree(application.studentId, input.scheduledAt, input.durationMinutes);

  const audience = await audienceFor(application);

  let interview;
  try {
    interview = await withTransaction(async (session) => {
      const [created] = await Interview.create(
        [
          {
            applicationId: application._id,
            scheduledAt: input.scheduledAt,
            durationMinutes: input.durationMinutes,
            mode: input.mode,
            meetingLink: input.meetingLink || undefined,
            location: input.location || undefined,
            notes: input.notes || undefined,
            scheduledBy: user.id,
          },
        ],
        { session },
      );
      await eventBus.publish(
        EVENTS.INTERVIEW_SCHEDULED,
        {
          interviewId: String(created._id),
          applicationId: String(application._id),
          scheduledAt: created.scheduledAt,
          mode: created.mode,
          // Resolved before the transaction - see audienceFor below.
          jobTitle: audience.jobTitle,
          studentUserId: audience.studentUserId,
        },
        { session },
      );
      return created;
    });
  } catch (err) {
    // The partial unique index, hit by a second booking for the same
    // application that got past the status gate at the same moment.
    if (err?.code === 11000) {
      throw AppError.conflict('That applicant already has an interview scheduled');
    }
    throw err;
  }

  await audit(user, 'interview.scheduled', interview._id, ip, { mode: interview.mode });

  return interview.toObject();
}

export async function reschedule(user, id, input, ip) {
  const interview = await Interview.findById(id);
  if (!interview) throw AppError.notFound('That interview does not exist');
  const application = await applicationForRecruiter(user, interview.applicationId);

  if (interview.status !== INTERVIEW_STATUS.SCHEDULED) {
    throw AppError.conflict(`A ${interview.status} interview cannot be moved`);
  }

  // Excluding itself, or an interview could never be moved by five minutes.
  await assertSlotIsFree(
    application.studentId,
    input.scheduledAt,
    interview.durationMinutes,
    interview._id,
  );

  interview.scheduledAt = input.scheduledAt;
  if (input.notes) interview.notes = input.notes;

  const audience = await audienceFor(application);

  await withTransaction(async (session) => {
    await interview.save({ session });
    // The same event name as scheduling, on purpose: every consumer wants the
    // new time in both cases, and a second name would mean two handlers doing
    // one job.
    await eventBus.publish(
      EVENTS.INTERVIEW_SCHEDULED,
      {
        interviewId: String(interview._id),
        applicationId: String(interview.applicationId),
        scheduledAt: interview.scheduledAt,
        mode: interview.mode,
        jobTitle: audience.jobTitle,
        studentUserId: audience.studentUserId,
      },
      { session },
    );
  });
  await audit(user, 'interview.rescheduled', interview._id, ip, {});

  return interview.toObject();
}

export async function cancel(user, id, ip) {
  const interview = await Interview.findById(id);
  if (!interview) throw AppError.notFound('That interview does not exist');
  await applicationForRecruiter(user, interview.applicationId);

  if (interview.status === INTERVIEW_STATUS.CANCELLED) {
    throw AppError.conflict('That interview is already cancelled');
  }

  interview.status = INTERVIEW_STATUS.CANCELLED;
  await interview.save();
  await audit(user, 'interview.cancelled', interview._id, ip, {});

  return interview.toObject();
}

/** Scoped by role: a student sees their own, a recruiter sees their company's. */
export async function list(user) {
  let applicationIds;

  if (user.role === ROLES.STUDENT) {
    const student = await Student.findOne({ userId: user.id }).lean();
    if (!student) throw AppError.notFound('Your student profile is missing');
    applicationIds = await Application.find({ studentId: student._id }).distinct('_id');
  } else if (user.role === ROLES.RECRUITER) {
    const company = await Company.findOne({ userId: user.id }).lean();
    if (!company) throw AppError.notFound('Your company profile is missing');
    const jobIds = await Job.find({ companyId: company._id }).distinct('_id');
    applicationIds = await Application.find({ jobId: { $in: jobIds } }).distinct('_id');
  }

  const filter = applicationIds ? { applicationId: { $in: applicationIds } } : {};

  const items = await Interview.find(filter)
    .sort({ scheduledAt: 1 })
    .populate({
      path: 'applicationId',
      select: 'status jobId studentId',
      populate: [
        { path: 'jobId', select: 'title companyId', populate: { path: 'companyId', select: 'name' } },
        { path: 'studentId', select: 'name rollNo' },
      ],
    })
    .lean();

  return { items };
}
