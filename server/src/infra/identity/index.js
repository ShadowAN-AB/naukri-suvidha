import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { bearerIdentity } from './bearer.js';
import { gatewayIdentity } from './gateway.js';

/**
 * Where this service gets the identity of a caller, chosen once at boot.
 *
 * Two strategies behind one interface, the same shape as infra/cache and
 * infra/llm, and for the same reason: the call sites must not know which is in
 * use. `requireAuth` asks for an identity and gets one or an error.
 *
 *   gateway - the edge already authenticated the request, by asking the auth
 *             service, and forwarded the result. Used by both container
 *             stacks. This is the real deployment.
 *   bearer  - verify the access token here and trust its claims. Used by
 *             `npm run dev` and the test suite, where there is no edge and no
 *             second process to start.
 *
 * The two are not equivalent and the difference is not hidden: bearer mode
 * cannot check revocation, because the users collection is the auth service's
 * now. See bearer.js, which says what that costs.
 */
const strategy = env.IDENTITY_MODE === 'gateway' ? gatewayIdentity : bearerIdentity;

logger.info({ mode: env.IDENTITY_MODE }, 'identity resolved by');

/** @returns {{ id: string, email: string, role: string }} or throws AppError */
export function identify(req) {
  return strategy(req);
}

export const identityMode = () => env.IDENTITY_MODE;
