import { createTokens } from '@naukri-suvidha/service-kit';
import { env, isProd } from '../config/env.js';

/**
 * This service's view of the token functions, built from its own environment.
 *
 * Nothing in this service mints one any more - the auth service does - so only
 * verifyAccessToken is on a request path here, in bearer mode. The signing
 * functions remain because the test suite needs to produce a token it can send
 * to itself, which is exactly as much minting as this service should do.
 *
 * Both processes build these from the same factory in service-kit and read the
 * same secrets, which is what makes a token signed in one verifiable in the
 * other.
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
