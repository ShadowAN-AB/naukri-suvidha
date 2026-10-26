import { createTokens } from '@naukri-suvidha/service-kit';
import { env, isProd } from './env.js';

/**
 * This service mints the tokens the API verifies. Both build them from the
 * same factory and the same secrets - see service-kit/src/tokens.js for why
 * that is a factory and not a module with a global.
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
