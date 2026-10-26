import { createIdentity } from '@naukri-suvidha/service-kit';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { verifyAccessToken } from '../../lib/tokens.js';

/**
 * This service's identity resolution, built from its own configuration.
 *
 * The two strategies live in service-kit: more than one service behind the
 * gateway has authenticated routes, and a second copy of the forwarded-identity
 * check would be a second chance to get an authorization check wrong.
 */
export const { identify, requireAuth, gatewayIdentity, bearerIdentity } = createIdentity({
  mode: env.IDENTITY_MODE,
  gatewaySecret: env.AUTH_GATEWAY_SECRET,
  verifyAccessToken,
});

logger.info({ mode: env.IDENTITY_MODE }, 'identity resolved by');

export const identityMode = () => env.IDENTITY_MODE;
