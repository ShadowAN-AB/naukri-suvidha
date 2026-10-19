import request from 'supertest';

import { createApp } from '../src/app.js';
import { User } from '../src/modules/auth/model.js';
import { Student, Company } from '../src/modules/profiles/model.js';
import { Job } from '../src/modules/jobs/model.js';
import { ROLES, JOB_STATUS } from '../src/lib/constants.js';
import { signAccessToken } from '../src/lib/tokens.js';
import bcrypt from 'bcryptjs';

export const app = createApp();
export const api = () => request(app);

const PASSWORD = 'Passw0rd1';

/** A user plus whichever profile their role implies, and a usable token. */
export async function makeUser(role, overrides = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const user = await User.create({
    email: overrides.email ?? `${role}-${suffix}@nexus.test`,
    role,
    passwordHash: await bcrypt.hash(PASSWORD, 10),
  });

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

  return { user, profile, token: signAccessToken(user), password: PASSWORD };
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
