import { createIdentity } from '@naukri-suvidha/service-kit';

import { env } from './env.js';
import { logger } from './logger.js';
import { verifyAccessToken } from './tokens.js';

/**
 * The same two strategies the API uses, built from this service's config.
 *
 * The inbox routes are a student's or recruiter's own data, so they are
 * authenticated - and behind the gateway that means reading the identity the
 * edge established rather than verifying a token here.
 */
export const { requireAuth } = createIdentity({
  mode: env.IDENTITY_MODE,
  gatewaySecret: env.AUTH_GATEWAY_SECRET,
  verifyAccessToken,
});

logger.info({ mode: env.IDENTITY_MODE }, 'identity resolved by');
