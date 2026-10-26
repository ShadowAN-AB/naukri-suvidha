import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

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
 *
 * This lives in service-kit rather than in either service because the auth
 * service mints these and the API verifies them. Two copies of this file would
 * be two definitions of what a session is, and they would diverge silently -
 * the failure mode being tokens that verify in one process and not the other,
 * which looks like a login bug and is not one.
 */

export const REFRESH_COOKIE = 'naukri_suvidha_rt';

/** Seconds, parsed from the "7d"-style TTL, for the cookie's maxAge. */
export function ttlSeconds(ttl) {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 7 * 24 * 3600;
  const n = Number(match[1]);
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
}

/**
 * What goes in the database. The token is the credential; its hash is only a
 * lookup key, so a leaked dump cannot be replayed.
 */
export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Build the token functions for one service, from that service's config.
 *
 * A factory and not a module that reads `env` itself, because two services now
 * import this and they resolve their environment at different moments. A
 * module-level `import { env }` would make the import order of unrelated files
 * decide whether the secrets were loaded yet - a race that shows up as a
 * start-up crash in one service and not the other.
 */
export function createTokens({ accessSecret, refreshSecret, accessTtl, refreshTtl, isProd }) {
  if (!accessSecret || !refreshSecret) {
    throw new Error('createTokens needs both JWT secrets');
  }

  return {
    REFRESH_COOKIE,
    ttlSeconds,
    hashRefreshToken,

    signAccessToken(user) {
      return jwt.sign(
        { role: user.role, v: user.tokenVersion ?? 0 },
        accessSecret,
        { subject: String(user._id), expiresIn: accessTtl },
      );
    },

    signRefreshToken(user, familyId) {
      return jwt.sign(
        {
          v: user.tokenVersion ?? 0,
          fam: String(familyId),
          /*
           * A nonce, and not decoration. `iat` has one-second resolution, so
           * two tokens signed for the same user and family inside the same
           * second are byte-identical - which during rotation means the
           * successor collides with its own predecessor on the stored hash.
           */
          jti: crypto.randomUUID(),
        },
        refreshSecret,
        { subject: String(user._id), expiresIn: refreshTtl },
      );
    },

    verifyAccessToken(token) {
      return jwt.verify(token, accessSecret);
    },

    verifyRefreshToken(token) {
      return jwt.verify(token, refreshSecret);
    },

    refreshCookieOptions() {
      return {
        httpOnly: true,
        secure: isProd, // required for sameSite 'none', and correct behind TLS
        sameSite: isProd ? 'none' : 'lax',
        path: '/api/auth',
        maxAge: ttlSeconds(refreshTtl) * 1000,
      };
    },
  };
}
