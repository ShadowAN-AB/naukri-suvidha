import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import { api, auth, makeJob, makeUser } from './helpers.js';
import { ROLES, JOB_STATUS, APPLICATION_STATUS } from '../src/lib/constants.js';
import { Application } from '../src/modules/applications/model.js';
import { Student } from '../src/modules/profiles/model.js';

/** A student with a resume on file, which applying requires. */
async function studentWithResume(overrides = {}) {
  const made = await makeUser(ROLES.STUDENT, overrides);
  const fakeResumeId = new mongoose.Types.ObjectId();
  await Student.updateOne({ _id: made.profile._id }, { $set: { currentResumeId: fakeResumeId } });
  return made;
}

describe('applying', () => {
  it('refuses without a resume on file', async () => {
    const { profile: company } = await makeUser(ROLES.RECRUITER);
    const { token } = await makeUser(ROLES.STUDENT);
    const job = await makeJob(company);

    const res = await api()
      .post('/api/applications')
      .set(auth(token))
      .send({ jobId: String(job._id) })
      .expect(400);
    expect(res.body.error.details.resume).toBeTruthy();
  });

  it('succeeds and writes the first timeline entry', async () => {
    const { profile: company } = await makeUser(ROLES.RECRUITER);
    const { token } = await studentWithResume();
    const job = await makeJob(company);

    const res = await api()
      .post('/api/applications')
      .set(auth(token))
      .send({ jobId: String(job._id) })
      .expect(201);

    expect(res.body.status).toBe(APPLICATION_STATUS.APPLIED);
    expect(res.body.timeline).toHaveLength(1);
    expect(res.body.timeline[0].status).toBe(APPLICATION_STATUS.APPLIED);
  });

  it('re-checks eligibility at write time, not just when the list was drawn', async () => {
    const { profile: company } = await makeUser(ROLES.RECRUITER);
    const { token } = await studentWithResume({ cgpa: 6.0 });
    const job = await makeJob(company, { minCgpa: 9 });

    const res = await api()
      .post('/api/applications')
      .set(auth(token))
      .send({ jobId: String(job._id) })
      .expect(403);
    expect(res.body.error.details.eligibility).toContain('CGPA');
  });

  it('refuses an unapproved job with 404, not 403', async () => {
    const { profile: company } = await makeUser(ROLES.RECRUITER);
    const { token } = await studentWithResume();
    const job = await makeJob(company, { status: JOB_STATUS.PENDING });

    await api()
      .post('/api/applications')
      .set(auth(token))
      .send({ jobId: String(job._id) })
      .expect(404);
  });

  it('refuses a second application to the same job', async () => {
    const { profile: company } = await makeUser(ROLES.RECRUITER);
    const { token } = await studentWithResume();
    const job = await makeJob(company);

    await api().post('/api/applications').set(auth(token)).send({ jobId: String(job._id) }).expect(201);
    await api().post('/api/applications').set(auth(token)).send({ jobId: String(job._id) }).expect(409);
  });

  /**
   * The real guarantee is the unique index, not a prior read - a check-then-write
   * loses this race. Two simultaneous clicks must produce one application.
   */
  it('survives two simultaneous applications', async () => {
    const { profile: company } = await makeUser(ROLES.RECRUITER);
    const { token } = await studentWithResume();
    const job = await makeJob(company);

    const results = await Promise.allSettled([
      api().post('/api/applications').set(auth(token)).send({ jobId: String(job._id) }),
      api().post('/api/applications').set(auth(token)).send({ jobId: String(job._id) }),
    ]);

    const codes = results.map((r) => r.value?.status).sort();
    expect(codes).toEqual([201, 409]);
    expect(await Application.countDocuments({ jobId: job._id })).toBe(1);
  });
});

describe('the status pipeline', () => {
  async function setup() {
    const recruiter = await makeUser(ROLES.RECRUITER);
    const student = await studentWithResume();
    const job = await makeJob(recruiter.profile);
    const res = await api()
      .post('/api/applications')
      .set(auth(student.token))
      .send({ jobId: String(job._id) })
      .expect(201);
    return { recruiter, student, job, applicationId: res.body._id };
  }

  it('refuses to skip a stage', async () => {
    const { recruiter, applicationId } = await setup();
    await api()
      .patch(`/api/applications/${applicationId}/status`)
      .set(auth(recruiter.token))
      .send({ status: 'offered' })
      .expect(409);
  });

  it('records the actor and the time on every move', async () => {
    const { recruiter, applicationId } = await setup();
    const res = await api()
      .patch(`/api/applications/${applicationId}/status`)
      .set(auth(recruiter.token))
      .send({ status: 'shortlisted', note: 'Looks strong' })
      .expect(200);

    const last = res.body.timeline.at(-1);
    expect(last.status).toBe('shortlisted');
    expect(String(last.byUserId)).toBe(String(recruiter.user._id));
    expect(last.note).toBe('Looks strong');
    expect(new Date(last.at).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('marks the student placed on an offer', async () => {
    const { recruiter, student, applicationId } = await setup();
    for (const status of ['shortlisted', 'interview', 'offered']) {
      await api()
        .patch(`/api/applications/${applicationId}/status`)
        .set(auth(recruiter.token))
        .send({ status })
        .expect(200);
    }
    const after = await Student.findById(student.profile._id).lean();
    expect(after.placementStatus).toBe('placed');
  });

  it('treats an offer as final', async () => {
    const { recruiter, applicationId } = await setup();
    for (const status of ['shortlisted', 'interview', 'offered']) {
      await api()
        .patch(`/api/applications/${applicationId}/status`)
        .set(auth(recruiter.token))
        .send({ status })
        .expect(200);
    }
    await api()
      .patch(`/api/applications/${applicationId}/status`)
      .set(auth(recruiter.token))
      .send({ status: 'rejected' })
      .expect(409);
  });

  it('stops another company touching the application', async () => {
    const { applicationId } = await setup();
    const { token: otherToken } = await makeUser(ROLES.RECRUITER);
    await api()
      .patch(`/api/applications/${applicationId}/status`)
      .set(auth(otherToken))
      .send({ status: 'shortlisted' })
      .expect(403);
  });

  it('lets a student withdraw before an offer, but not after', async () => {
    const { recruiter, student, applicationId } = await setup();
    await api()
      .patch(`/api/applications/${applicationId}/status`)
      .set(auth(recruiter.token))
      .send({ status: 'shortlisted' })
      .expect(200);

    await api().post(`/api/applications/${applicationId}/withdraw`).set(auth(student.token)).expect(200);
    await api().post(`/api/applications/${applicationId}/withdraw`).set(auth(student.token)).expect(409);
  });
});
