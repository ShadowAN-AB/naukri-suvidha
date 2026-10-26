import { checkEligibility, canTransition } from '@naukri-suvidha/shared';

import { AppError } from '../../middleware/error.js';
import { logger } from '../../config/logger.js';
import { eventBus } from '../../infra/events/eventBus.js';
import { withTransaction } from '../../infra/events/transactions.js';
import {
  APPLICATION_STATUS,
  EVENTS,
  JOB_STATUS,
  PLACEMENT_STATUS,
  ROLES,
} from '../../lib/constants.js';
import { Application } from './model.js';
import { Job } from '../jobs/model.js';
import { Student, Company } from '../profiles/model.js';
import { FitScore } from '../ai/model.js';
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
      entity: 'Application',
      entityId,
      ip,
      meta,
    });
  } catch (err) {
    logger.error({ err, action }, 'audit write failed');
  }
}

async function studentFor(user) {
  const student = await Student.findOne({ userId: user.id }).lean();
  if (!student) throw AppError.notFound('Your student profile is missing');
  return student;
}

async function companyFor(user) {
  const company = await Company.findOne({ userId: user.id }).lean();
  if (!company) throw AppError.notFound('Your company profile is missing');
  return company;
}

export async function apply(user, jobId, ip) {
  const student = await studentFor(user);

  if (!student.currentResumeId) {
    throw AppError.badRequest('Upload a resume before applying', {
      resume: 'You need a resume on file to apply.',
    });
  }

  const job = await Job.findById(jobId).lean();
  // An unapproved job is invisible to students, so this must not confirm it exists.
  if (!job || job.status !== JOB_STATUS.APPROVED) {
    throw AppError.notFound('That job does not exist');
  }

  // The same rules the list query filtered by, applied again at the moment of
  // writing. A stale page or a direct API call does not get to skip them.
  const { eligible, failures } = checkEligibility(student, job);
  if (!eligible) {
    throw AppError.forbidden('You are not eligible for this job', {
      eligibility: failures.map((f) => f.message).join(' '),
    });
  }

  const doc = {
    jobId: job._id,
    studentId: student._id,
    resumeId: student.currentResumeId,
    status: APPLICATION_STATUS.APPLIED,
    appliedAt: new Date(),
    timeline: [
      { status: APPLICATION_STATUS.APPLIED, byUserId: user.id, at: new Date(), note: 'Applied' },
    ],
  };

  let application;
  try {
    /*
     * The row and its event commit together, so there is no instant in which
     * an application exists and nothing has been told about it. Where there
     * is no replica set `session` is null and the publish happens straight
     * after the write, as it used to.
     */
    application = await withTransaction(async (session) => {
      const [created] = await Application.create([doc], { session });
      await eventBus.publish(
        EVENTS.APPLICATION_SUBMITTED,
        {
          applicationId: String(created._id),
          jobId: String(job._id),
          studentId: String(student._id),
        },
        { session },
      );
      return created;
    });
  } catch (err) {
    // Deduplication is the unique (jobId, studentId) index, not a prior read:
    // two simultaneous clicks cannot both pass a check-then-write. Inside a
    // transaction the duplicate aborts it, so the event is rolled back with
    // the row it described - which is the behaviour we want and a thing the
    // old publish-after-write could not do.
    if (err.code === 11000) {
      throw AppError.conflict('You have already applied to this job');
    }
    throw err;
  }
  await audit(user, 'application.submitted', application._id, ip, { jobId: String(job._id) });

  return application.toObject();
}

export async function listApplications(user, query) {
  const { page, limit, status, jobId } = query;
  const skip = (page - 1) * limit;
  const filter = {};
  if (status) filter.status = status;

  if (user.role === ROLES.STUDENT) {
    const student = await studentFor(user);
    filter.studentId = student._id;
  } else if (user.role === ROLES.RECRUITER) {
    const company = await companyFor(user);
    const jobIds = await Job.find({ companyId: company._id }).distinct('_id');
    // Scoped to this company's jobs, so a guessed jobId cannot widen it.
    filter.jobId = jobId
      ? { $in: jobIds.filter((id) => String(id) === String(jobId)) }
      : { $in: jobIds };
  } else if (jobId) {
    filter.jobId = jobId;
  }

  const [items, total] = await Promise.all([
    Application.find(filter)
      .sort({ fitScore: -1, appliedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'jobId', select: 'title ctcLpa deadline status companyId', populate: { path: 'companyId', select: 'name' } })
      .populate('studentId', 'name rollNo branch batchYear cgpa backlogs skills currentResumeId')
      .lean(),
    Application.countDocuments(filter),
  ]);

  // Attach the reasoning behind each score so a recruiter sees why an
  // applicant ranks where they do, not just a number.
  const fits = await FitScore.find({
    $or: items.map((a) => ({ studentId: a.studentId?._id ?? a.studentId, jobId: a.jobId?._id ?? a.jobId })),
  }).lean();
  const key = (s, j) => `${s}:${j}`;
  const byPair = new Map(fits.map((f) => [key(f.studentId, f.jobId), f]));

  const decorated = items.map((a) => {
    const f = byPair.get(key(a.studentId?._id ?? a.studentId, a.jobId?._id ?? a.jobId));
    return {
      ...a,
      fit: f
        ? { score: f.score, breakdown: f.breakdown, reasoning: f.reasoning, model: f.model, fallback: f.fallback }
        : null,
    };
  });

  return { items: decorated, total, page, limit, pages: Math.ceil(total / limit) || 1 };
}

async function loadForActor(user, id) {
  const application = await Application.findById(id);
  if (!application) throw AppError.notFound('That application does not exist');

  if (user.role === ROLES.RECRUITER) {
    const company = await companyFor(user);
    const job = await Job.findById(application.jobId).lean();
    if (!job || String(job.companyId) !== String(company._id)) {
      throw AppError.forbidden('That application is for another company’s job');
    }
  }
  return application;
}

export async function changeStatus(user, id, { status, note }, ip) {
  const application = await loadForActor(user, id);

  if (!canTransition(application.status, status)) {
    throw AppError.conflict(
      `An application cannot go from ${application.status} to ${status}`,
      { status: `${application.status} is ${['offered','rejected','withdrawn'].includes(application.status) ? 'final' : 'not followed by that stage'}` },
    );
  }

  application.status = status;
  application.timeline.push({ status, byUserId: user.id, at: new Date(), note: note || undefined });

  await withTransaction(async (session) => {
    await application.save({ session });

    // An offer is what the placement numbers are counted from, so it belongs
    // in the same commit: a student marked placed without the event, or the
    // event without the flag, would show different numbers on two screens.
    if (status === APPLICATION_STATUS.OFFERED) {
      await Student.updateOne(
        { _id: application.studentId },
        { $set: { placementStatus: PLACEMENT_STATUS.PLACED } },
        { session },
      );
    }

    await eventBus.publish(
      EVENTS.APPLICATION_STATUS_CHANGED,
      {
        applicationId: String(application._id),
        studentId: String(application.studentId),
        jobId: String(application.jobId),
        status,
      },
      { session },
    );
  });
  await audit(user, 'application.status_changed', application._id, ip, { status });

  return application.toObject();
}

export async function withdraw(user, id, ip) {
  const student = await studentFor(user);
  const application = await Application.findOne({ _id: id, studentId: student._id });
  if (!application) throw AppError.notFound('That application does not exist');

  if ([APPLICATION_STATUS.OFFERED, APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.WITHDRAWN].includes(application.status)) {
    throw AppError.conflict(`You cannot withdraw an application that is already ${application.status}`);
  }

  application.status = APPLICATION_STATUS.WITHDRAWN;
  application.timeline.push({
    status: APPLICATION_STATUS.WITHDRAWN,
    byUserId: user.id,
    at: new Date(),
    note: 'Withdrawn by the student',
  });
  await application.save();
  await audit(user, 'application.withdrawn', application._id, ip, {});

  return application.toObject();
}
