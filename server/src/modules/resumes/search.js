import { AppError } from '../../middleware/error.js';
import { logger } from '../../config/logger.js';
import { getEmbeddings } from '../../infra/embeddings/index.js';
import { getVectorIndex } from '../../infra/vector/index.js';
import { ROLES } from '../../lib/constants.js';
import { Resume } from './model.js';
import { Student, Company } from '../profiles/model.js';
import { Job } from '../jobs/model.js';
import { Application } from '../applications/model.js';

/**
 * Semantic search over resumes.
 *
 * This deliberately does NOT widen who may read a resume. The corpus is
 * narrowed to the same set the reader could already open one from:
 *
 *   admin      every student - the placement office already has this right
 *   recruiter  only students who applied to one of their own jobs
 *   student    nothing; this is not a tool for comparing yourself to peers
 *
 * Narrowing happens in the database filter, before ranking, so an ineligible
 * resume is never scored, never returned, and never leaks through a snippet.
 */
async function corpusFilter(user) {
  if (user.role === ROLES.ADMIN) return {};

  if (user.role === ROLES.RECRUITER) {
    const company = await Company.findOne({ userId: user.id }).lean();
    if (!company) throw AppError.notFound('Your company profile is missing');

    const jobIds = await Job.find({ companyId: company._id }).distinct('_id');
    const studentIds = await Application.find({ jobId: { $in: jobIds } }).distinct('studentId');
    return { studentId: { $in: studentIds } };
  }

  throw AppError.forbidden('Resume search is for recruiters and the placement office');
}

/** Terms from the query that the student actually lists, for a cheap "why". */
function overlap(query, skills = []) {
  const words = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((w) => w.length > 1),
  );
  return skills.filter((s) => {
    const lower = s.toLowerCase();
    return words.has(lower) || [...words].some((w) => lower.includes(w) && w.length > 3);
  });
}

export async function searchResumes(user, { q, limit = 10 }) {
  const query = String(q ?? '').trim();
  if (query.length < 3) {
    throw AppError.badRequest('Search for something longer than two characters', {
      q: 'Describe what you are looking for, such as "built event-driven backends"',
    });
  }

  const filter = await corpusFilter(user);

  const embeddings = getEmbeddings();
  let queryVector;
  try {
    [queryVector] = await embeddings.embed([query]);
  } catch (err) {
    // No model, no semantic search. Say so rather than silently returning
    // nothing, which looks identical to "no matches".
    logger.warn({ err: err.message }, 'embedding the query failed');
    throw new AppError(503, 'SEARCH_UNAVAILABLE', 'Semantic search needs the embedding model, which is not reachable right now.', {
      hint: 'Ordinary filtering still works.',
    });
  }

  const started = Date.now();
  const hits = await getVectorIndex(Resume, { indexName: 'resume_vec' }).search({
    queryVector,
    filter,
    limit,
  });
  const took = Date.now() - started;

  if (hits.length === 0) return { items: [], query, tookMs: took, searched: 0 };

  // Hydrate only what is shown. The vector itself is never returned.
  const resumes = await Resume.find({ _id: { $in: hits.map((h) => h._id) } })
    .select('studentId version originalName parsedProfile parseStatus')
    .lean();
  const byId = new Map(resumes.map((r) => [String(r._id), r]));

  const students = await Student.find({
    _id: { $in: resumes.map((r) => r.studentId) },
  })
    .select('name rollNo branch batchYear cgpa backlogs skills placementStatus currentResumeId')
    .lean();
  const studentById = new Map(students.map((s) => [String(s._id), s]));

  const items = hits
    .map((hit) => {
      const resume = byId.get(String(hit._id));
      if (!resume) return null;
      const student = studentById.get(String(resume.studentId));
      if (!student) return null;

      const profile = resume.parsedProfile ?? {};
      return {
        resumeId: String(resume._id),
        score: Number(hit.score.toFixed(4)),
        student: {
          id: String(student._id),
          name: student.name,
          rollNo: student.rollNo,
          branch: student.branch,
          batchYear: student.batchYear,
          cgpa: student.cgpa,
          backlogs: student.backlogs,
          placementStatus: student.placementStatus,
          currentResumeId: student.currentResumeId ? String(student.currentResumeId) : null,
        },
        skills: profile.skills ?? student.skills ?? [],
        matchedTerms: overlap(query, profile.skills ?? student.skills ?? []),
        experience: (profile.experience ?? []).map(
          (e) => `${e.role ?? 'Role'} at ${e.company ?? 'a company'}`,
        ),
        projects: (profile.projects ?? []).map((p) => p.name).filter(Boolean),
      };
    })
    .filter(Boolean);

  return { items, query, tookMs: took, searched: hits.length, model: embeddings.model };
}
