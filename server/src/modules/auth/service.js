import bcrypt from 'bcryptjs';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../middleware/error.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/tokens.js';
import { ROLES, USER_STATUS } from '../../lib/constants.js';
import { User } from './model.js';
import { Student, Company } from '../profiles/model.js';
import { AuditLog } from '../admin/model.js';

/**
 * A real bcrypt hash, computed once at start-up, compared against when the
 * email is unknown so that login costs the same whether the account exists or
 * not.
 *
 * This must be a genuine hash. A hand-written placeholder is rejected as
 * malformed and returns in microseconds, which leaves exactly the user
 * enumeration oracle it was meant to close.
 */
const DUMMY_HASH = bcrypt.hashSync('nexus placeholder, never a real password', env.BCRYPT_ROUNDS);

/** Shape sent to the client. Never includes the hash. */
function publicUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    role: user.role,
    status: user.status,
  };
}

async function audit(actorId, action, entity, entityId, ip, meta) {
  try {
    await AuditLog.create({ actorId, action, entity, entityId, ip, meta });
  } catch (err) {
    // An audit write must never fail the request it is describing.
    logger.error({ err, action }, 'audit write failed');
  }
}

export async function register(input, ip) {
  const existing = await User.findOne({ email: input.email }).lean();
  if (existing) {
    throw AppError.conflict('An account with that email already exists', {
      email: 'That email is already registered',
    });
  }

  if (input.role === ROLES.STUDENT) {
    const clash = await Student.findOne({ rollNo: input.rollNo }).lean();
    if (clash) {
      throw AppError.conflict('That roll number is already registered', {
        rollNo: 'That roll number is already registered',
      });
    }
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  const user = await User.create({ email: input.email, role: input.role, passwordHash });

  // The local database is a standalone mongod, which has no transactions, so
  // a failed profile write is undone by hand rather than rolled back.
  try {
    let profile;
    if (input.role === ROLES.STUDENT) {
      profile = await Student.create({
        userId: user._id,
        name: input.name,
        phone: input.phone || undefined,
        rollNo: input.rollNo,
        branch: input.branch,
        batchYear: input.batchYear,
        cgpa: input.cgpa,
        backlogs: input.backlogs ?? 0,
      });
    } else {
      profile = await Company.create({
        userId: user._id,
        name: input.companyName,
        website: input.website || undefined,
        industry: input.industry || undefined,
      });
    }

    await audit(user._id, 'auth.register', 'User', user._id, ip, { role: user.role });

    return {
      user: publicUser(user),
      profile,
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user),
    };
  } catch (err) {
    await User.deleteOne({ _id: user._id });
    if (err.code === 11000) {
      throw AppError.conflict('That roll number is already registered', {
        rollNo: 'That roll number is already registered',
      });
    }
    throw err;
  }
}

export async function login({ email, password }, ip) {
  const user = await User.findOne({ email }).select('+passwordHash');

  // Always run a full comparison, even when the account is unknown, so the
  // response time does not reveal which emails exist.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !ok) {
    await audit(user?._id, 'auth.login_failed', 'User', user?._id, ip, { email });
    throw AppError.unauthorized('Email or password is incorrect');
  }
  if (user.status !== USER_STATUS.ACTIVE) {
    throw AppError.forbidden('This account is suspended. Contact the placement office.');
  }

  user.lastLoginAt = new Date();
  await user.save();
  await audit(user._id, 'auth.login', 'User', user._id, ip, { role: user.role });

  return {
    user: publicUser(user),
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}

export async function refresh(token) {
  if (!token) throw AppError.unauthorized('No refresh token');

  let claims;
  try {
    claims = verifyRefreshToken(token);
  } catch {
    throw AppError.unauthorized('Session expired, sign in again');
  }

  const user = await User.findById(claims.sub);
  if (!user) throw AppError.unauthorized('Account no longer exists');
  if (user.status !== USER_STATUS.ACTIVE) throw AppError.forbidden('This account is suspended');
  if ((user.tokenVersion ?? 0) !== (claims.v ?? 0)) {
    throw AppError.unauthorized('Session ended, sign in again');
  }

  return { user: publicUser(user), accessToken: signAccessToken(user) };
}

export async function me(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw AppError.unauthorized('Account no longer exists');

  let profile = null;
  if (user.role === ROLES.STUDENT) profile = await Student.findOne({ userId }).lean();
  if (user.role === ROLES.RECRUITER) profile = await Company.findOne({ userId }).lean();

  return { user: publicUser(user), profile };
}
