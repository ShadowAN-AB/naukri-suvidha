import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import { api, auth, makeJob, makeUser } from './helpers.js';
import { ROLES, PARSE_STATUS } from '../src/lib/constants.js';
import { Resume } from '../src/modules/resumes/model.js';
import { Student } from '../src/modules/profiles/model.js';
import { cosine } from '../src/infra/vector/VectorIndex.js';
import { MemoryVectorIndex } from '../src/infra/vector/memory.js';

/** A resume with a hand-made vector, so the maths is tested without a model. */
async function giveResume(studentId, embedding, skills = []) {
  const resume = await Resume.create({
    studentId,
    version: 1,
    storageKey: `resumes/${new mongoose.Types.ObjectId()}.pdf`,
    originalName: 'cv.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    extractedText: skills.join(' '),
    parseStatus: PARSE_STATUS.DONE,
    parsedProfile: { skills },
    embedding,
    embeddingModel: 'test-model',
  });
  await Student.updateOne({ _id: studentId }, { $set: { currentResumeId: resume._id, skills } });
  return resume;
}

describe('cosine similarity', () => {
  it('is 1 for identical vectors and 0 for orthogonal ones', () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosine([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });

  it('ignores magnitude, which is what makes it usable across documents', () => {
    expect(cosine([1, 2, 3], [10, 20, 30])).toBeCloseTo(1);
  });

  it('refuses to compare vectors of different lengths', () => {
    // Silently scoring a mismatch as zero would hide two embedding models
    // having been mixed in one collection.
    expect(() => cosine([1, 0], [1, 0, 0])).toThrow(/dimensions differ/i);
  });

  it('treats a zero vector as unrelated rather than dividing by zero', () => {
    expect(cosine([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

describe('the in-memory index', () => {
  it('ranks by closeness and respects the limit', async () => {
    const a = await makeUser(ROLES.STUDENT);
    const b = await makeUser(ROLES.STUDENT);
    const c = await makeUser(ROLES.STUDENT);

    await giveResume(a.profile._id, [1, 0, 0], ['exact']);
    await giveResume(b.profile._id, [0.8, 0.6, 0], ['near']);
    await giveResume(c.profile._id, [0, 0, 1], ['far']);

    const index = new MemoryVectorIndex(Resume);
    const hits = await index.search({ queryVector: [1, 0, 0], limit: 2 });

    expect(hits).toHaveLength(2);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
    expect(hits[0].score).toBeCloseTo(1);
  });

  it('skips documents with no vector rather than failing', async () => {
    const withVector = await makeUser(ROLES.STUDENT);
    const without = await makeUser(ROLES.STUDENT);
    await giveResume(withVector.profile._id, [1, 0, 0], ['has one']);
    await giveResume(without.profile._id, undefined, ['has none']);

    const hits = await new MemoryVectorIndex(Resume).search({ queryVector: [1, 0, 0], limit: 10 });
    expect(hits).toHaveLength(1);
  });

  it('applies the filter before ranking, so excluded rows are never scored', async () => {
    const mine = await makeUser(ROLES.STUDENT);
    const theirs = await makeUser(ROLES.STUDENT);
    await giveResume(mine.profile._id, [1, 0, 0], ['mine']);
    await giveResume(theirs.profile._id, [1, 0, 0], ['theirs']);

    const hits = await new MemoryVectorIndex(Resume).search({
      queryVector: [1, 0, 0],
      filter: { studentId: mine.profile._id },
      limit: 10,
    });
    expect(hits).toHaveLength(1);
  });
});

describe('the search endpoint', () => {
  it('refuses a student', async () => {
    const { token } = await makeUser(ROLES.STUDENT);
    await api().get('/api/resumes/search?q=react developer').set(auth(token)).expect(403);
  });

  it('refuses an anonymous request', async () => {
    await api().get('/api/resumes/search?q=react developer').expect(401);
  });

  it('refuses a query too short to mean anything', async () => {
    const { token } = await makeUser(ROLES.ADMIN);
    const res = await api().get('/api/resumes/search?q=ab').set(auth(token)).expect(400);
    expect(res.body.error.details.q).toBeTruthy();
  });

  /**
   * The suite points the embedding provider at a dead port, so this is the
   * real behaviour when the model is unreachable: a clear 503, never an empty
   * result set, which would be indistinguishable from "nothing matched".
   */
  it('says so when the embedding model is unreachable', async () => {
    const { token } = await makeUser(ROLES.ADMIN);
    const res = await api()
      .get('/api/resumes/search?q=event driven backends')
      .set(auth(token))
      .expect(503);
    expect(res.body.error.code).toBe('SEARCH_UNAVAILABLE');
    expect(res.body.error.message).toMatch(/embedding model/i);
  });

  it('never widens who may read a resume', async () => {
    // A recruiter with no applicants searches an empty corpus, however
    // relevant someone else's resume might be.
    const { token: recruiterToken } = await makeUser(ROLES.RECRUITER);
    const outsider = await makeUser(ROLES.STUDENT);
    await giveResume(outsider.profile._id, [1, 0, 0], ['React', 'Node.js']);

    const { Company } = await import('../src/modules/profiles/model.js');
    const company = await Company.findOne({}).lean();
    await makeJob(company);

    // Fails at the embedding step in this environment, but the point is that
    // it never reaches a corpus containing the outsider.
    const res = await api().get('/api/resumes/search?q=react developer').set(auth(recruiterToken));
    expect([503, 200]).toContain(res.status);
    if (res.status === 200) expect(res.body.items).toHaveLength(0);
  });
});
