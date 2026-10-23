import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env, isProd } from '../config/env.js';

/**
 * Two tokens with different jobs.
 *
 * The access token is short-lived and travels in the Authorization header. It
 * is held in memory by the client and never written to localStorage, so a XSS
 * bug cannot read a token that outlives the page.
 *
 * The refresh token is long-lived and travels in an httpOnly cookie scoped to
 * /api/auth, so JavaScript cannot read it and it is not attached to any other
 * request. Both carry the user's tokenVersion: bumping that column invalidates
 * every token already issued to that user.
 */

export const REFRESH_COOKIE = 'naukri_suvidha_rt';

export function signAccessToken(user) {
  return jwt.sign(
    { role: user.role, v: user.tokenVersion ?? 0 },
    env.JWT_ACCESS_SECRET,
    { subject: String(user._id), expiresIn: env.ACCESS_TOKEN_TTL },
  );
}

export function signRefreshToken(user, familyId) {
  return jwt.sign(
    {
      v: user.tokenVersion ?? 0,
      fam: String(familyId),
      /*
       * A nonce, and not decoration. `iat` has one-second resolution, so two
       * tokens signed for the same user and family inside the same second are
       * byte-identical - which during rotation means the successor collides
       * with its own predecessor on the stored hash.
       */
      jti: crypto.randomUUID(),
    },
    env.JWT_REFRESH_SECRET,
    { subject: String(user._id), expiresIn: env.REFRESH_TOKEN_TTL },
  );
}

/**
 * What goes in the database. The token is the credential; its hash is only a
 * lookup key, so a leaked dump cannot be replayed.
 */
export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

/** Seconds, parsed from the "7d"-style TTL, for the cookie's maxAge. */
export function ttlSeconds(ttl) {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 7 * 24 * 3600;
  const n = Number(match[1]);
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd, // required for sameSite 'none', and correct behind TLS
    sameSite: isProd ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: ttlSeconds(env.REFRESH_TOKEN_TTL) * 1000,
  };
}
