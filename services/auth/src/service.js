import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { AppError, USER_STATUS } from '@naukri-suvidha/service-kit';

import { env } from './env.js';
import { logger } from './logger.js';
import {
  hashRefreshToken,
  signAccessToken,
  signRefreshToken,
  ttlSeconds,
  verifyAccessToken,
  verifyRefreshToken,
} from './tokens.js';
import { RefreshToken, User } from './model.js';
import { appendAudit, createProfile } from './apiClient.js';

/**
 * A real bcrypt hash, computed once at start-up, compared against when the
 * email is unknown so that login costs the same whether the account exists or
 * not.
 *
 * This must be a genuine hash. A hand-written placeholder is rejected as
 * malformed and returns in microseconds, which leaves exactly the user
 * enumeration oracle it was meant to close.
 */
const DUMMY_HASH = bcrypt.hashSync('naukri suvidha placeholder, never a real password', env.BCRYPT_ROUNDS);

/** Shape sent to the client. Never includes the hash. */
function publicUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    role: user.role,
    status: user.status,
  };
}

/*
 * The audit trail belongs to the API, so this is now a call rather than an
 * insert. What it is worth has not changed - an audit write must never fail
 * the request it is describing - so it is still fire-and-forget, and the
 * swallowing of failures moved into apiClient.appendAudit with it.
 */
/** The actor fields an audit row stores, read off a user document. */
const actorOf = (user) => ({ id: user._id, email: user.email, role: user.role });

function audit(actor, action, entity, entityId, ip, meta, requestId) {
  appendAudit(
    {
      actorId: actor?.id ? String(actor.id) : undefined,
      // This service holds the user record, so it is the one place that can
      // supply these first-hand rather than from a forwarded header. The API
      // cannot join to them - see the comment on actorId in its admin model.
      actorEmail: actor?.email,
      actorRole: actor?.role,
      action,
      entity,
      entityId,
      ip,
      meta,
    },
    { requestId },
  );
}

/**
 * Create an account, which is now a write in two services.
 *
 * The user row belongs here; the Student or Company row belongs to the API.
 * There is no transaction spanning the two, and there is no honest way to get
 * one - so this is a compensation rather than a rollback: write the user, ask
 * the API for the profile, and delete the user if the API refuses.
 *
 * The shape is not new. On a standalone mongod this function already undid its
 * own user write by hand, because there were no transactions to roll back
 * either. Crossing a process boundary changed what can fail in the middle, not
 * what has to be done about it.
 *
 * What the window costs, precisely: if this process dies between the two
 * writes, a user exists with no profile. They can sign in and the API will
 * answer 404 for their profile. That is recoverable by registering again
 * against the same email - which is refused as a conflict - so it needs a real
 * answer eventually, and the real answer is the outbox pattern this repository
 * already uses for events: write an intent, let a worker finish it. It is not
 * built here because the window is small and the failure is visible, and
 * saying so is better than implying the compensation closed it.
 */
export async function register(input, ip, requestId) {
  const existing = await User.findOne({ email: input.email }).lean();
  if (existing) {
    throw AppError.conflict('An account with that email already exists', {
      email: 'That email is already registered',
    });
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  const user = await User.create({ email: input.email, role: input.role, passwordHash });

  try {
    /*
     * The roll-number clash is checked there, not here. The API owns the
     * Students collection and the unique index on it, so it is the only
     * process that can answer without guessing - and its 409 carries the
     * field details the registration form puts under the right input.
     */
    const profile = await createProfile(input, { userId: String(user._id), requestId });

    audit(actorOf(user), 'auth.register', 'User', user._id, ip, { role: user.role }, requestId);

    return {
      user: publicUser(user),
      profile,
      ...(await issueSession(user)),
    };
  } catch (err) {
    // Compensate. Without this a refused profile leaves an account that can
    // sign in and has nothing to sign in to, and the email is then taken.
    await User.deleteOne({ _id: user._id }).catch((cleanupErr) =>
      logger.error({ err: cleanupErr, userId: String(user._id) },
        'could not compensate a failed registration; a user row is orphaned'),
    );
    throw err;
  }
}

/**
 * Start a session: a new family, and the first refresh token in it.
 *
 * The row is written before the token is handed out, so a token can never be
 * valid without a record to rotate or revoke.
 */
async function issueSession(user, familyId = new mongoose.Types.ObjectId()) {
  const refreshToken = signRefreshToken(user, familyId);
  await RefreshToken.create({
    userId: user._id,
    familyId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + ttlSeconds(env.REFRESH_TOKEN_TTL) * 1000),
  });
  return { accessToken: signAccessToken(user), refreshToken };
}

/** Tear down a whole session, every token in the chain at once. */
async function revokeFamily(familyId) {
  if (!mongoose.isValidObjectId(familyId)) return;
  await RefreshToken.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function login({ email, password }, ip, requestId) {
  const user = await User.findOne({ email }).select('+passwordHash');

  // Always run a full comparison, even when the account is unknown, so the
  // response time does not reveal which emails exist.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !ok) {
    /*
       * A failed login has no confirmed actor, so only the attempted email is
       * recorded - and `user` is deliberately not passed even when the email
       * resolved, because nothing was proved about who sent the request.
       */
      audit({ id: user?._id, role: user?.role }, 'auth.login_failed', 'User', user?._id, ip, { email }, requestId);
    throw AppError.unauthorized('Email or password is incorrect');
  }
  if (user.status !== USER_STATUS.ACTIVE) {
    throw AppError.forbidden('This account is suspended. Contact the placement office.');
  }

  user.lastLoginAt = new Date();
  await user.save();
  audit(actorOf(user), 'auth.login', 'User', user._id, ip, { role: user.role }, requestId);

  return {
    user: publicUser(user),
    ...(await issueSession(user)),
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

  /*
   * Claim the token and retire it in one write. Doing it atomically is what
   * makes the replay check mean anything: two requests holding the same token
   * cannot both find it unused, so the loser is treated as a replay rather
   * than quietly issued a second live session.
   */
  const claimed = await RefreshToken.findOneAndUpdate(
    { tokenHash: hashRefreshToken(token), usedAt: null, revokedAt: null },
    { $set: { usedAt: new Date() } },
  );

  if (!claimed) {
    /*
     * The token verifies but could not be claimed, which leaves three cases
     * and one correct response. Either it was already exchanged - so someone
     * is replaying a token that should have been discarded - or its family was
     * revoked, or it was signed with a leaked secret and no row was ever
     * written. A stolen token looks exactly like the first case, so the whole
     * session is torn down and both the thief and the real user are sent back
     * to the sign-in page. Being wrong here costs one sign-in; being lenient
     * costs the account.
     */
    await revokeFamily(claims.fam);
    logger.warn({ userId: String(user._id) }, 'refresh token replayed; session revoked');
    throw AppError.unauthorized('Session ended, sign in again');
  }

  return {
    user: publicUser(user),
    ...(await issueSession(user, claimed.familyId)),
  };
}

/** Sign out: the cookie goes, and so does every token in its family. */
export async function logout(token) {
  if (!token) return;
  try {
    await revokeFamily(verifyRefreshToken(token).fam);
  } catch {
    // An expired or forged cookie has no session to end. Logging out is not
    // a place to report that.
  }
}

/**
 * Turn a bearer token into an identity, or refuse it.
 *
 * This is the endpoint the whole extraction turns on. The edge calls it once
 * per request - nginx `auth_request` - and forwards what comes back to the
 * API, which is why the API no longer verifies a token or reads a user.
 *
 * It does exactly what the API's requireAuth used to do, in the process that
 * owns the data: verify the signature, then check the row, because a token
 * that has not expired is not the same as a session that is still allowed.
 * Both of the checks after the lookup are the reason this cannot be a pure
 * signature check anywhere else - a suspended account and a signed-out one
 * both still hold a valid token.
 *
 * Note what this costs: one indexed lookup per request, same as before. The
 * database hit did not disappear with the extraction, it moved - and it is
 * now on a hop that every request to every endpoint makes. Caching it in
 * Redis under the token's jti, for the access token's own lifetime, is the
 * obvious next move and is not made here; measuring first is cheaper than
 * guessing, and a cache over a revocation check needs its invalidation
 * thought about rather than assumed.
 */
export async function introspect(token) {
  if (!token) throw AppError.unauthorized('Missing access token');

  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch (err) {
    throw AppError.unauthorized(
      err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token',
    );
  }

  const user = await User.findById(claims.sub).lean();
  if (!user) throw AppError.unauthorized('Account no longer exists');
  if (user.status !== USER_STATUS.ACTIVE) throw AppError.forbidden('This account is suspended');
  if ((user.tokenVersion ?? 0) !== (claims.v ?? 0)) {
    throw AppError.unauthorized('Session ended, sign in again');
  }

  return { id: String(user._id), email: user.email, role: user.role };
}
