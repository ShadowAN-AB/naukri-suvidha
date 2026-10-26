import request from 'supertest';
import mongoose from 'mongoose';

import { createApp } from '../src/app.js';
import { Student, Company } from '../src/modules/profiles/model.js';
import { Job } from '../src/modules/jobs/model.js';
import { ROLES, JOB_STATUS } from '../src/lib/constants.js';
import { signAccessToken } from '../src/lib/tokens.js';

export const app = createApp();
export const api = () => request(app);

/**
 * A profile, and a token that will be accepted for it.
 *
 * No user row, because there is nowhere to put one: `users` belongs to the
 * auth service and lives in a different database. What a user *is*, to this
 * service, is now exactly an id and a role - so that is what this makes, and
 * the suite is more honest for it.
 *
 * The suite runs in bearer mode (IDENTITY_MODE defaults to it), so a signed
 * access token is all that is needed. The token's own tests live with the
 * service that mints it, in services/auth.
 */
export async function makeUser(role, overrides = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const user = {
    _id: new mongoose.Types.ObjectId(),
    email: overrides.email ?? `${role}-${suffix}@naukrisuvidha.test`,
    role,
    tokenVersion: 0,
  };

  let profile = null;
  if (role === ROLES.STUDENT) {
    profile = await Student.create({
      userId: user._id,
      name: overrides.name ?? 'Test Student',
      rollNo: overrides.rollNo ?? `R${suffix.toUpperCase()}`,
      branch: overrides.branch ?? 'CSE',
      batchYear: overrides.batchYear ?? 2027,
      cgpa: overrides.cgpa ?? 8.5,
      backlogs: overrides.backlogs ?? 0,
      skills: overrides.skills ?? ['JavaScript', 'Node.js'],
      ...(overrides.currentResumeId ? { currentResumeId: overrides.currentResumeId } : {}),
    });
  } else if (role === ROLES.RECRUITER) {
    profile = await Company.create({
      userId: user._id,
      name: overrides.companyName ?? `Company ${suffix}`,
    });
  }

  return { user, profile, token: signAccessToken(user) };
}

export async function makeJob(company, overrides = {}) {
  return Job.create({
    companyId: company._id,
    title: overrides.title ?? 'Software Engineer',
    description: overrides.description ?? 'A role that exists only so a test can apply to it.',
    skillsRequired: overrides.skillsRequired ?? ['JavaScript'],
    minCgpa: overrides.minCgpa ?? 6,
    maxBacklogs: overrides.maxBacklogs ?? 0,
    allowedBranches: overrides.allowedBranches ?? [],
    ctcLpa: overrides.ctcLpa ?? 10,
    deadline: overrides.deadline ?? new Date(Date.now() + 30 * 86400000),
    status: overrides.status ?? JOB_STATUS.APPROVED,
  });
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });
