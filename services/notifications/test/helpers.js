import { createTokens } from '@naukri-suvidha/service-kit';

import { env } from '../src/env.js';

/**
 * Mints an access token the way the auth service would.
 *
 * The suite runs in bearer mode, so the inbox routes verify a signature. The
 * token is built from the same factory and the same secret the auth service
 * uses - which is the point of that factory living in service-kit.
 */
export const { signAccessToken } = createTokens({
  accessSecret: env.JWT_ACCESS_SECRET,
  refreshSecret: env.JWT_REFRESH_SECRET,
  accessTtl: env.ACCESS_TOKEN_TTL,
  refreshTtl: env.REFRESH_TOKEN_TTL,
  isProd: false,
});
