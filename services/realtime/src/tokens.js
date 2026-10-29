import { createTokens } from '@naukri-suvidha/service-kit';
import { env, isProd } from './env.js';

// Only verifyAccessToken is used, and only in bearer mode - the auth service
// mints these. Built from the same factory and the same secrets as every other
// service, which is what makes a token signed in one verifiable here.
export const { signAccessToken, verifyAccessToken } = createTokens({
  accessSecret: env.JWT_ACCESS_SECRET,
  refreshSecret: env.JWT_REFRESH_SECRET,
  accessTtl: env.ACCESS_TOKEN_TTL,
  refreshTtl: env.REFRESH_TOKEN_TTL,
  isProd,
});
