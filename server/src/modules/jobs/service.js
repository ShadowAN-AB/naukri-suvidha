import { checkEligibility, eligibilityFilter } from '@nexus/shared';

import { AppError } from '../../middleware/error.js';
import { logger } from '../../config/logger.js';
import { eventBus } from '../../infra/events/eventBus.js';
import { EVENTS, JOB_STATUS, ROLES } from '../../lib/constants.js';
import { Job } from './model.js';
import { Student, Company } from '../profiles/model.js';
import { AuditLog } from '../admin/model.js';

/** Changing any of these after approval re-opens the approval question. */
const ELIGIBILITY_FIELDS = ['minCgpa', 'maxBacklogs', 'allowedBranches'];

async function audit(actorId, action, entityId, ip, meta) {
  try {
    await AuditLog.create({ actorId, action, entity: 'Job', entityId, ip, meta });
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
  const job = await Job.create({ ...input, companyId: company._id, status: JOB_STATUS.PENDING });

  eventBus.publish(EVENTS.JOB_CREATED, { jobId: String(job._id), companyId: String(company._id) });
  await audit(user.id, 'job.created', job._id, ip, { title: job.title });

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

  const [items, total] = await Promise.all([
    Job.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('companyId', 'name industry website verified')
      .lean(),
    Job.countDocuments(filter),
  ]);

  // Students see why a job is closed to them, not just that it is.
  const withEligibility = student
    ? items.map((job) => ({ ...job, eligibility: checkEligibility(student, job) }))
    : items;

  return { items: withEligibility, total, page, limit, pages: Math.ceil(total / limit) || 1 };
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
  await audit(user.id, 'job.updated', job._id, ip, { requeued, fields: Object.keys(patch) });

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
  await job.save();

  eventBus.publish(EVENTS.JOB_APPROVED, {
    jobId: String(job._id),
    companyId: String(job.companyId),
    title: job.title,
  });
  await audit(user.id, 'job.approved', job._id, ip, { title: job.title });

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

  await audit(user.id, 'job.rejected', job._id, ip, { reason });
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
  await audit(user.id, 'job.closed', job._id, ip, { title: job.title });

  return job.toObject();
}
