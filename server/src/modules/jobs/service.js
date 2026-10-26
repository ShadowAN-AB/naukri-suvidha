import { checkEligibility, eligibilityFilter } from '@naukri-suvidha/shared';

import { AppError } from '../../middleware/error.js';
import { logger } from '../../config/logger.js';
import { eventBus } from '../../infra/events/eventBus.js';
import { withTransaction } from '../../infra/events/transactions.js';
import { EVENTS, JOB_STATUS, ROLES } from '../../lib/constants.js';
import { Job } from './model.js';
import { Student, Company } from '../profiles/model.js';
import { FitScore } from '../ai/model.js';
import { AuditLog } from '../admin/model.js';

/** Changing any of these after approval re-opens the approval question. */
const ELIGIBILITY_FIELDS = ['minCgpa', 'maxBacklogs', 'allowedBranches'];

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
      entity: 'Job',
      entityId,
      ip,
      meta,
    });
  } catch (err) {
    logger.error({ err, action }, 'audit write failed');
  }
}

async function companyFor(user) {
  const company = await Company.findOne({ userId: user.id }).lean();
  if (!company) throw AppError.notFound('Your company profile is missing');
  return company;
}

async function studentFor(user) {
  const student = await Student.findOne({ userId: user.id }).lean();
  if (!student) throw AppError.notFound('Your student profile is missing');
  return student;
}

export async function createJob(user, input, ip) {
  const company = await companyFor(user);

  // Always pending. A recruiter cannot publish straight to students, which is
  // the whole point of the approval gate.
  const job = await withTransaction(async (session) => {
    const [created] = await Job.create(
      [{ ...input, companyId: company._id, status: JOB_STATUS.PENDING }],
      { session },
    );
    await eventBus.publish(
      EVENTS.JOB_CREATED,
      { jobId: String(created._id), companyId: String(company._id) },
      { session },
    );
    return created;
  });
  await audit(user, 'job.created', job._id, ip, { title: job.title });

  return job.toObject();
}

export async function listJobs(user, query) {
  const { page, limit, status, search, eligibleOnly } = query;
  const skip = (page - 1) * limit;

  let filter = {};
  let student = null;

  if (user.role === ROLES.STUDENT) {
    student = await studentFor(user);
    // Students only ever see approved, open jobs. eligibleOnly narrows further
    // to the ones they can actually apply to.
    filter = eligibleOnly
      ? eligibilityFilter(student)
      : { status: JOB_STATUS.APPROVED, deadline: { $gte: new Date() } };
  } else if (user.role === ROLES.RECRUITER) {
    const company = await companyFor(user);
    filter = { companyId: company._id, ...(status ? { status } : {}) };
  } else {
    filter = status ? { status } : {};
  }

  if (search) filter.$text = { $search: search };

  // A recruiter or admin list is plain and paginates in the database.
  if (!student) {
    const [items, total] = await Promise.all([
      Job.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('companyId', 'name industry website verified')
        .lean(),
      Job.countDocuments(filter),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) || 1 };
  }

  // A student's list is ordered by fit, which lives in another collection, so
  // it is assembled and sorted here. A campus has tens of open jobs, not
  // thousands, so reading them all is cheaper than a lookup pipeline.
  const all = await Job.find(filter)
    .limit(500)
    .populate('companyId', 'name industry website verified')
    .lean();

  const scores = await FitScore.find({
    studentId: student._id,
    jobId: { $in: all.map((j) => j._id) },
  }).lean();
  const byJob = new Map(scores.map((s) => [String(s.jobId), s]));

  const decorated = all.map((job) => {
    const fit = byJob.get(String(job._id));
    return {
      ...job,
      eligibility: checkEligibility(student, job),
      fit: fit
        ? {
            score: fit.score,
            breakdown: fit.breakdown,
            reasoning: fit.reasoning,
            model: fit.model,
            fallback: fit.fallback,
          }
        : null,
    };
  });

  // Best fit first; anything not scored yet sits below what has been, rather
  // than being hidden, so a student is never shown an empty list while the
  // queue is still working.
  decorated.sort((a, b) => {
    const sa = a.fit?.score ?? -1;
    const sb = b.fit?.score ?? -1;
    if (sb !== sa) return sb - sa;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return {
    items: decorated.slice(skip, skip + limit),
    total: decorated.length,
    page,
    limit,
    pages: Math.ceil(decorated.length / limit) || 1,
    scored: decorated.filter((j) => j.fit).length,
  };
}

export async function getJob(user, id) {
  const job = await Job.findById(id)
    .populate('companyId', 'name industry website verified')
    .lean();
  if (!job) throw AppError.notFound('That job does not exist');

  if (user.role === ROLES.STUDENT) {
    if (job.status !== JOB_STATUS.APPROVED) {
      // Do not leak that an unapproved job exists at all.
      throw AppError.notFound('That job does not exist');
    }
    const student = await studentFor(user);
    return { ...job, eligibility: checkEligibility(student, job) };
  }

  if (user.role === ROLES.RECRUITER) {
    const company = await companyFor(user);
    if (String(job.companyId?._id ?? job.companyId) !== String(company._id)) {
      throw AppError.forbidden('That job belongs to another company');
    }
  }

  return job;
}

export async function updateJob(user, id, patch, ip) {
  const job = await Job.findById(id);
  if (!job) throw AppError.notFound('That job does not exist');

  if (user.role === ROLES.RECRUITER) {
    const company = await companyFor(user);
    if (String(job.companyId) !== String(company._id)) {
      throw AppError.forbidden('That job belongs to another company');
    }
  }

  if (job.status === JOB_STATUS.CLOSED) {
    throw AppError.conflict('A closed job cannot be edited');
  }

  const touchesEligibility = ELIGIBILITY_FIELDS.some(
    (f) => patch[f] !== undefined && JSON.stringify(patch[f]) !== JSON.stringify(job[f]),
  );

  Object.assign(job, patch);

  // An approved job whose eligibility rules change goes back to the queue.
  // Without this a recruiter could be approved on easy terms and then tighten
  // them, which would make the gate decorative.
  let requeued = false;
  if (job.status === JOB_STATUS.APPROVED && touchesEligibility && user.role !== ROLES.ADMIN) {
    job.status = JOB_STATUS.PENDING;
    job.approvedBy = undefined;
    job.approvedAt = undefined;
    requeued = true;
  }
  if (job.status === JOB_STATUS.REJECTED) {
    job.status = JOB_STATUS.PENDING;
    job.rejectionReason = undefined;
  }

  await job.save();
  await audit(user, 'job.updated', job._id, ip, { requeued, fields: Object.keys(patch) });

  return { job: job.toObject(), requeued };
}

export async function approveJob(user, id, ip) {
  const job = await Job.findById(id);
  if (!job) throw AppError.notFound('That job does not exist');
  if (job.status === JOB_STATUS.APPROVED) throw AppError.conflict('That job is already approved');
  if (job.status === JOB_STATUS.CLOSED) throw AppError.conflict('That job is closed');

  job.status = JOB_STATUS.APPROVED;
  job.approvedBy = user.id;
  job.approvedAt = new Date();
  job.rejectionReason = undefined;

  /*
   * Who should be told, resolved here rather than by whoever is listening.
   *
   * An event carries what its consumers need to act. The alternative - a
   * consumer that looks up the company to find the recruiter - only works
   * while the consumer can see the companies collection, and notifications
   * cannot: it is a separate service with its own database. Resolving it in
   * the service that owns the data is what keeps the event self-contained.
   */
  const company = await Company.findById(job.companyId).select('userId').lean();

  await withTransaction(async (session) => {
    await job.save({ session });
    await eventBus.publish(
      EVENTS.JOB_APPROVED,
      {
        jobId: String(job._id),
        companyId: String(job.companyId),
        title: job.title,
        recruiterUserId: company?.userId ? String(company.userId) : null,
      },
      { session },
    );
  });
  await audit(user, 'job.approved', job._id, ip, { title: job.title });

  return job.toObject();
}

export async function rejectJob(user, id, reason, ip) {
  const job = await Job.findById(id);
  if (!job) throw AppError.notFound('That job does not exist');
  if (job.status === JOB_STATUS.CLOSED) throw AppError.conflict('That job is closed');

  job.status = JOB_STATUS.REJECTED;
  job.rejectionReason = reason;
  job.approvedBy = undefined;
  job.approvedAt = undefined;
  await job.save();

  await audit(user, 'job.rejected', job._id, ip, { reason });
  return job.toObject();
}

export async function closeJob(user, id, ip) {
  const job = await Job.findById(id);
  if (!job) throw AppError.notFound('That job does not exist');

  if (user.role === ROLES.RECRUITER) {
    const company = await companyFor(user);
    if (String(job.companyId) !== String(company._id)) {
      throw AppError.forbidden('That job belongs to another company');
    }
  }
  if (job.status === JOB_STATUS.CLOSED) throw AppError.conflict('That job is already closed');

  job.status = JOB_STATUS.CLOSED;
  await job.save();
  await audit(user, 'job.closed', job._id, ip, { title: job.title });

  return job.toObject();
}
