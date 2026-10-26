import { createTokens } from '@naukri-suvidha/service-kit';
import { env, isProd } from '../config/env.js';

/**
 * This service's view of the token functions, built from its own environment.
 *
 * It only verifies now - the auth service mints them. Both processes build
 * these from the same factory in service-kit and read the same secrets, which
 * is what makes a token signed in one verifiable in the other.
 */
export const {
  REFRESH_COOKIE,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashRefreshToken,
  refreshCookieOptions,
  ttlSeconds,
} = createTokens({
  accessSecret: env.JWT_ACCESS_SECRET,
  refreshSecret: env.JWT_REFRESH_SECRET,
  accessTtl: env.ACCESS_TOKEN_TTL,
  refreshTtl: env.REFRESH_TOKEN_TTL,
  isProd,
});
