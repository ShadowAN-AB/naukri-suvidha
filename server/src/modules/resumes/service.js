import { AppError } from '../../middleware/error.js';
import { logger } from '../../config/logger.js';
import { getStorage } from '../../infra/storage/index.js';
import { eventBus } from '../../infra/events/eventBus.js';
import { EVENTS, PARSE_STATUS, ROLES } from '../../lib/constants.js';
import { sniffFileType } from '../../lib/fileType.js';
import { extractText } from './extract.js';
import { Resume } from './model.js';
import { Student, Company } from '../profiles/model.js';
import { Application } from '../applications/model.js';
import { Job } from '../jobs/model.js';

async function studentFor(user) {
  const student = await Student.findOne({ userId: user.id }).lean();
  if (!student) throw AppError.notFound('Your student profile is missing');
  return student;
}

export async function uploadResume(user, file, _ip) {
  if (!file) throw AppError.badRequest('No file was uploaded', { file: 'Choose a PDF or DOCX' });

  // The extension and Content-Type came from the client. The bytes did not.
  const sniffed = sniffFileType(file.buffer);
  if (!sniffed) {
    throw AppError.badRequest('That file is not a PDF or a Word document', {
      file: 'Upload a PDF or DOCX. The file’s contents did not match its name.',
    });
  }

  const student = await studentFor(user);
  const storage = getStorage();

  const { storageKey, sizeBytes } = await storage.put(file.buffer, {
    originalName: `resume${sniffed.ext}`,
    mimeType: sniffed.mime,
    prefix: 'resumes',
  });

  const extraction = await extractText(file.buffer, sniffed.kind);

  // Versions are per student and monotonic, so an old resume is never
  // overwritten and an application can keep pointing at the one it was sent with.
  const latest = await Resume.findOne({ studentId: student._id }).sort({ version: -1 }).lean();
  const version = (latest?.version ?? 0) + 1;

  let resume;
  try {
    resume = await Resume.create({
      studentId: student._id,
      version,
      storageKey,
      originalName: file.originalname?.slice(0, 200) ?? `resume${sniffed.ext}`,
      mimeType: sniffed.mime,
      sizeBytes,
      extractedText: extraction.text,
      parseStatus: extraction.ok ? PARSE_STATUS.PENDING : PARSE_STATUS.FAILED,
      parseError: extraction.ok ? undefined : extraction.error,
    });
  } catch (err) {
    // Do not leave an orphaned file behind if the row could not be written.
    await storage.delete(storageKey).catch(() => {});
    throw err;
  }

  await Student.updateOne({ _id: student._id }, { $set: { currentResumeId: resume._id } });

  if (extraction.ok) {
    // Phase 5's worker consumes this to build a structured profile.
    eventBus.publish(EVENTS.RESUME_UPLOADED, {
      resumeId: String(resume._id),
      studentId: String(student._id),
    });
  } else {
    logger.warn({ resumeId: String(resume._id), reason: extraction.error }, 'resume stored but unreadable');
  }

  const { extractedText: _text, ...safe } = resume.toObject();
  return {
    ...safe,
    textLength: extraction.text.length,
    pages: extraction.pages,
    warning: extraction.ok ? null : extraction.error,
  };
}

export async function listMyResumes(user) {
  const student = await studentFor(user);
  const items = await Resume.find({ studentId: student._id }).sort({ version: -1 }).lean();
  return {
    items,
    currentResumeId: student.currentResumeId ? String(student.currentResumeId) : null,
  };
}

/**
 * Who may read a given resume: the student who owns it, an admin, or a
 * recruiter at a company the student has actually applied to. A recruiter
 * cannot browse resumes of students who never applied to them.
 */
async function assertCanRead(user, resume) {
  if (user.role === ROLES.ADMIN) return;

  if (user.role === ROLES.STUDENT) {
    const student = await studentFor(user);
    if (String(resume.studentId) === String(student._id)) return;
    throw AppError.notFound('That resume does not exist');
  }

  if (user.role === ROLES.RECRUITER) {
    const company = await Company.findOne({ userId: user.id }).lean();
    if (!company) throw AppError.forbidden('Your company profile is missing');

    const jobIds = await Job.find({ companyId: company._id }).distinct('_id');
    const applied = await Application.exists({
      studentId: resume.studentId,
      jobId: { $in: jobIds },
    });
    if (applied) return;
    throw AppError.forbidden('That student has not applied to any of your jobs');
  }

  throw AppError.forbidden();
}

export async function getResumeFile(user, id) {
  const resume = await Resume.findById(id).lean();
  if (!resume) throw AppError.notFound('That resume does not exist');
  await assertCanRead(user, resume);

  const buffer = await getStorage().get(resume.storageKey);
  return { buffer, mimeType: resume.mimeType, originalName: resume.originalName };
}

export async function getResumeText(user, id) {
  const resume = await Resume.findById(id).select('+extractedText').lean();
  if (!resume) throw AppError.notFound('That resume does not exist');
  await assertCanRead(user, resume);
  return {
    id: String(resume._id),
    parseStatus: resume.parseStatus,
    parseError: resume.parseError ?? null,
    extractedText: resume.extractedText ?? '',
  };
}
