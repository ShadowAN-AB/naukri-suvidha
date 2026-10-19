import { AppError } from '../../middleware/error.js';
import { logger } from '../../config/logger.js';
import { eventBus } from '../../infra/events/eventBus.js';
import { EVENTS, INTERVIEW_STATUS, ROLES } from '../../lib/constants.js';
import { Interview } from './model.js';
import { Application } from '../applications/model.js';
import { Job } from '../jobs/model.js';
import { Student, Company } from '../profiles/model.js';
import { AuditLog } from '../admin/model.js';

async function audit(actorId, action, entityId, ip, meta) {
  try {
    await AuditLog.create({ actorId, action, entity: 'Interview', entityId, ip, meta });
  } catch (err) {
    logger.error({ err, action }, 'audit write failed');
  }
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

export async function schedule(user, input, ip) {
  const application = await applicationForRecruiter(user, input.applicationId);

  // Interviewing someone who was rejected or withdrew is a mistake, not a
  // feature, so the pipeline state gates it.
  if (!['shortlisted', 'interview'].includes(application.status)) {
    throw AppError.conflict(
      `An interview can only be scheduled for a shortlisted applicant. This one is ${application.status}.`,
    );
  }

  const interview = await Interview.create({
    applicationId: application._id,
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes,
    mode: input.mode,
    meetingLink: input.meetingLink || undefined,
    location: input.location || undefined,
    notes: input.notes || undefined,
    scheduledBy: user.id,
  });

  eventBus.publish(EVENTS.INTERVIEW_SCHEDULED, {
    interviewId: String(interview._id),
    applicationId: String(application._id),
    scheduledAt: interview.scheduledAt,
    mode: interview.mode,
  });
  await audit(user.id, 'interview.scheduled', interview._id, ip, { mode: interview.mode });

  return interview.toObject();
}

export async function reschedule(user, id, input, ip) {
  const interview = await Interview.findById(id);
  if (!interview) throw AppError.notFound('That interview does not exist');
  await applicationForRecruiter(user, interview.applicationId);

  if (interview.status !== INTERVIEW_STATUS.SCHEDULED) {
    throw AppError.conflict(`A ${interview.status} interview cannot be moved`);
  }

  interview.scheduledAt = input.scheduledAt;
  if (input.notes) interview.notes = input.notes;
  await interview.save();

  eventBus.publish(EVENTS.INTERVIEW_SCHEDULED, {
    interviewId: String(interview._id),
    applicationId: String(interview.applicationId),
    scheduledAt: interview.scheduledAt,
    mode: interview.mode,
  });
  await audit(user.id, 'interview.rescheduled', interview._id, ip, {});

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
  await audit(user.id, 'interview.cancelled', interview._id, ip, {});

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
