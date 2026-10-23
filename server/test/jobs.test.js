import { describe, expect, it } from 'vitest';

import { api, auth, makeJob, makeUser } from './helpers.js';
import { ROLES, JOB_STATUS } from '../src/lib/constants.js';
import { jobUpdateSchema } from '@nexus/shared';

describe('the approval gate', () => {
  it('creates every job pending, whatever the recruiter sends', async () => {
    const { token } = await makeUser(ROLES.RECRUITER);
    const res = await api()
      .post('/api/jobs')
      .set(auth(token))
      .send({
        title: 'Backend Engineer',
        description: 'A description long enough to clear the minimum length rule.',
        ctcLpa: 12,
        deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
        // A recruiter trying to self-approve is simply ignored: status is not
        // in the schema, so Zod strips it before the service ever sees it.
        status: 'approved',
      })
      .expect(201);
    expect(res.body.status).toBe(JOB_STATUS.PENDING);
  });

  it('hides a pending job from students entirely', async () => {
    const { profile: company } = await makeUser(ROLES.RECRUITER);
    const { token: studentToken } = await makeUser(ROLES.STUDENT);
    const job = await makeJob(company, { status: JOB_STATUS.PENDING });

    const list = await api().get('/api/jobs?limit=50').set(auth(studentToken)).expect(200);
    expect(list.body.items.find((j) => j._id === String(job._id))).toBeUndefined();

    // 404 rather than 403: a 403 would confirm the job exists.
    await api().get(`/api/jobs/${job._id}`).set(auth(studentToken)).expect(404);
  });

  it('shows it once an admin approves', async () => {
    const { profile: company } = await makeUser(ROLES.RECRUITER);
    const { token: adminToken } = await makeUser(ROLES.ADMIN);
    const { token: studentToken } = await makeUser(ROLES.STUDENT);
    const job = await makeJob(company, { status: JOB_STATUS.PENDING });

    await api().post(`/api/jobs/${job._id}/approve`).set(auth(adminToken)).expect(200);

    const list = await api().get('/api/jobs?limit=50').set(auth(studentToken)).expect(200);
    expect(list.body.items.find((j) => j._id === String(job._id))).toBeDefined();
  });

  it('refuses to let a recruiter approve their own job', async () => {
    const { profile: company, token } = await makeUser(ROLES.RECRUITER);
    const job = await makeJob(company, { status: JOB_STATUS.PENDING });
    await api().post(`/api/jobs/${job._id}/approve`).set(auth(token)).expect(403);
  });

  it('sends an approved job back to the queue when eligibility is tightened', async () => {
    const { profile: company, token } = await makeUser(ROLES.RECRUITER);
    const job = await makeJob(company, { minCgpa: 6 });

    const res = await api()
      .patch(`/api/jobs/${job._id}`)
      .set(auth(token))
      .send({ minCgpa: 9.5 })
      .expect(200);

    expect(res.body.requeued).toBe(true);
    expect(res.body.job.status).toBe(JOB_STATUS.PENDING);
  });

  it('leaves approval alone when only the description changes', async () => {
    const { profile: company, token } = await makeUser(ROLES.RECRUITER);
    const job = await makeJob(company, { minCgpa: 6, allowedBranches: ['CSE'], maxBacklogs: 0 });

    const res = await api()
      .patch(`/api/jobs/${job._id}`)
      .set(auth(token))
      .send({ description: 'An edit that touches no eligibility rule whatsoever.' })
      .expect(200);

    expect(res.body.requeued).toBe(false);
    expect(res.body.job.status).toBe(JOB_STATUS.APPROVED);

    // The rules themselves have to survive the edit, not just the approval.
    expect(res.body.job.minCgpa).toBe(6);
    expect(res.body.job.allowedBranches).toEqual(['CSE']);
  });
});

/*
 * Pinned because a Zod major bump already broke it once: v4 keeps a field's
 * default through `.partial()` where v3 dropped it, which turned every edit
 * into a full reset of the eligibility rules.
 */
describe('the update schema', () => {
  it('sends only what was actually edited', () => {
    const patch = jobUpdateSchema.parse({ description: 'A description long enough to pass.' });
    expect(Object.keys(patch)).toEqual(['description']);
  });

  it('fills in no eligibility rule the caller left out', () => {
    const patch = jobUpdateSchema.parse({ title: 'Backend Engineer' });
    for (const field of ['minCgpa', 'maxBacklogs', 'allowedBranches', 'skillsRequired']) {
      expect(patch[field]).toBeUndefined();
    }
  });
});

describe('ownership', () => {
  it('stops a recruiter editing another company’s job', async () => {
    const { profile: companyA } = await makeUser(ROLES.RECRUITER);
    const { token: tokenB } = await makeUser(ROLES.RECRUITER);
    const job = await makeJob(companyA);
    await api().patch(`/api/jobs/${job._id}`).set(auth(tokenB)).send({ ctcLpa: 99 }).expect(403);
  });

  it('stops a student posting a job at all', async () => {
    const { token } = await makeUser(ROLES.STUDENT);
    await api()
      .post('/api/jobs')
      .set(auth(token))
      .send({
        title: 'Nope',
        description: 'Students must never be able to create a posting.',
        ctcLpa: 10,
        deadline: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(403);
  });

  it('refuses a deadline in the past', async () => {
    const { token } = await makeUser(ROLES.RECRUITER);
    const res = await api()
      .post('/api/jobs')
      .set(auth(token))
      .send({
        title: 'Too late',
        description: 'A posting whose deadline has already gone by.',
        ctcLpa: 10,
        deadline: '2020-01-01T00:00:00.000Z',
      })
      .expect(400);
    expect(res.body.error.details.deadline).toBeTruthy();
  });
});

describe('query validation', () => {
  // Express 5 makes req.query a getter, so a validate() that assigns to it
  // silently does nothing and pagination computes NaN. This is that regression.
  it('applies schema defaults to the query string', async () => {
    const { token } = await makeUser(ROLES.STUDENT);
    const res = await api().get('/api/jobs').set(auth(token)).expect(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
    expect(Number.isNaN(res.body.pages)).toBe(false);
  });

  it('rejects a limit beyond the maximum', async () => {
    const { token } = await makeUser(ROLES.STUDENT);
    await api().get('/api/jobs?limit=9999').set(auth(token)).expect(400);
  });
});
