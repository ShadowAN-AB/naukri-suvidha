import { describe, expect, it } from 'vitest';
import { checkEligibility, eligibilityFilter, ELIGIBILITY } from '@naukri-suvidha/shared';

import { Job } from '../src/modules/jobs/model.js';
import { makeJob, makeUser } from './helpers.js';
import { ROLES } from '../src/lib/constants.js';

const student = { cgpa: 8.0, backlogs: 0, branch: 'CSE' };
const openJob = {
  status: 'approved',
  deadline: new Date(Date.now() + 86400000),
  minCgpa: 7,
  maxBacklogs: 0,
  allowedBranches: ['CSE', 'IT'],
};

describe('checkEligibility', () => {
  it('passes a student who clears every rule', () => {
    expect(checkEligibility(student, openJob).eligible).toBe(true);
  });

  it('fails on CGPA, and says what was needed', () => {
    const { eligible, failures } = checkEligibility({ ...student, cgpa: 6.9 }, openJob);
    expect(eligible).toBe(false);
    expect(failures[0].rule).toBe(ELIGIBILITY.CGPA);
    expect(failures[0].message).toContain('7');
  });

  it('treats an empty branch list as every branch', () => {
    const anyBranch = { ...openJob, allowedBranches: [] };
    expect(checkEligibility({ ...student, branch: 'MECH' }, anyBranch).eligible).toBe(true);
  });

  it('fails a job that is not approved, without leaking why it exists', () => {
    const { failures } = checkEligibility(student, { ...openJob, status: 'pending' });
    expect(failures.map((f) => f.rule)).toContain(ELIGIBILITY.NOT_OPEN);
  });

  it('fails a passed deadline', () => {
    const past = { ...openJob, deadline: new Date(Date.now() - 86400000) };
    expect(checkEligibility(student, past).failures.map((f) => f.rule)).toContain(ELIGIBILITY.DEADLINE);
  });

  it('reports every reason at once, not just the first', () => {
    const { failures } = checkEligibility({ cgpa: 5, backlogs: 3, branch: 'MECH' }, openJob);
    expect(failures.length).toBe(3);
  });

  it('is exclusive on backlogs: at the limit passes, one over fails', () => {
    const job = { ...openJob, maxBacklogs: 1 };
    expect(checkEligibility({ ...student, backlogs: 1 }, job).eligible).toBe(true);
    expect(checkEligibility({ ...student, backlogs: 2 }, job).eligible).toBe(false);
  });
});

/**
 * The rules exist twice - once as a function and once as a database filter -
 * because a per-student list has to be narrowed in the query. This is the test
 * that keeps the two honest.
 */
describe('eligibilityFilter agrees with checkEligibility', () => {
  it('returns exactly the jobs the function calls eligible', async () => {
    const { profile: company } = await makeUser(ROLES.RECRUITER);
    const { profile: me } = await makeUser(ROLES.STUDENT, {
      cgpa: 7.5,
      backlogs: 1,
      branch: 'ECE',
    });

    await Promise.all([
      makeJob(company, { title: 'exact fit', minCgpa: 7.5, maxBacklogs: 1, allowedBranches: ['ECE'] }),
      makeJob(company, { title: 'cgpa too high', minCgpa: 9, maxBacklogs: 1, allowedBranches: [] }),
      makeJob(company, { title: 'no backlogs allowed', minCgpa: 6, maxBacklogs: 0, allowedBranches: [] }),
      makeJob(company, { title: 'wrong branch', minCgpa: 6, maxBacklogs: 2, allowedBranches: ['CSE'] }),
      makeJob(company, { title: 'open to all', minCgpa: 0, maxBacklogs: 5, allowedBranches: [] }),
      makeJob(company, { title: 'not approved', status: 'pending', minCgpa: 0, maxBacklogs: 5 }),
      makeJob(company, {
        title: 'deadline passed',
        minCgpa: 0,
        maxBacklogs: 5,
        deadline: new Date(Date.now() - 86400000),
      }),
    ]);

    const all = await Job.find({}).lean();
    const byFunction = all
      .filter((job) => checkEligibility(me, job).eligible)
      .map((j) => j.title)
      .sort();

    const byQuery = (await Job.find(eligibilityFilter(me)).lean()).map((j) => j.title).sort();

    expect(byQuery).toEqual(byFunction);
    expect(byFunction).toEqual(['exact fit', 'open to all']);
  });
});
