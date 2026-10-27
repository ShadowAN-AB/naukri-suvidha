import { createTokens } from '@naukri-suvidha/service-kit';
import { env, isProd } from './env.js';

// Only verifyAccessToken is used, and only in bearer mode. The auth service
// mints these; both build them from the same factory and the same secrets.
export const { verifyAccessToken } = createTokens({
  accessSecret: env.JWT_ACCESS_SECRET,
  refreshSecret: env.JWT_REFRESH_SECRET,
  accessTtl: env.ACCESS_TOKEN_TTL,
  refreshTtl: env.REFRESH_TOKEN_TTL,
  isProd,
});
