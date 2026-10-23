import { checkEligibility, canTransition } from '@naukri-suvidha/shared';

import { AppError } from '../../middleware/error.js';
import { logger } from '../../config/logger.js';
import { eventBus } from '../../infra/events/eventBus.js';
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

async function audit(actorId, action, entityId, ip, meta) {
  try {
    await AuditLog.create({ actorId, action, entity: 'Application', entityId, ip, meta });
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
    application = await Application.create(doc);
  } catch (err) {
    // Deduplication is the unique (jobId, studentId) index, not a prior read:
    // two simultaneous clicks cannot both pass a check-then-write.
    if (err.code === 11000) {
      throw AppError.conflict('You have already applied to this job');
    }
    throw err;
  }

  eventBus.publish(EVENTS.APPLICATION_SUBMITTED, {
    applicationId: String(application._id),
    jobId: String(job._id),
    studentId: String(student._id),
  });
  await audit(user.id, 'application.submitted', application._id, ip, { jobId: String(job._id) });

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
  await application.save();

  // An offer is what the placement numbers are counted from.
  if (status === APPLICATION_STATUS.OFFERED) {
    await Student.updateOne(
      { _id: application.studentId },
      { $set: { placementStatus: PLACEMENT_STATUS.PLACED } },
    );
  }

  eventBus.publish(EVENTS.APPLICATION_STATUS_CHANGED, {
    applicationId: String(application._id),
    studentId: String(application.studentId),
    jobId: String(application.jobId),
    status,
  });
  await audit(user.id, 'application.status_changed', application._id, ip, { status });

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
  await audit(user.id, 'application.withdrawn', application._id, ip, {});

  return application.toObject();
}
