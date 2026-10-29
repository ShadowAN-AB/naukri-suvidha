import { AppError, IDENTITY_HEADERS } from '@naukri-suvidha/service-kit';

import { env } from './env.js';
import { logger } from './logger.js';

/**
 * This service's one call into the auth service.
 *
 * It moved here verbatim from the API, and the move is the whole point of the
 * extraction: the API made this call *only* because it happened to host the
 * socket server. It owned no part of the handshake otherwise. Now the service
 * that holds the connection is the service that authenticates it, and the API
 * has one fewer crossing.
 */

const configured = () => Boolean(env.AUTH_SERVICE_URL);

/**
 * Introspect a handshake's token.
 *
 * Returns null when there is no auth service to ask, which is bearer mode -
 * the caller verifies the token itself there.
 */
export async function introspectToken(token) {
  if (!configured()) return null;

  let res;
  try {
    res = await fetch(`${env.AUTH_SERVICE_URL}/internal/introspect`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        [IDENTITY_HEADERS.PROOF]: env.AUTH_GATEWAY_SECRET ?? '',
      },
      signal: AbortSignal.timeout(env.AUTH_SERVICE_TIMEOUT_MS),
    });
  } catch (err) {
    // A handshake is not a page load; refusing it is recoverable and the
    // client reconnects. Letting one through unauthenticated is not.
    logger.warn({ err }, 'auth service unreachable for a socket handshake');
    throw AppError.unavailable('Could not verify the session');
  }

  if (res.ok) return (await res.json()).user;

  const payload = await res.json().catch(() => null);
  throw AppError.unauthorized(payload?.error?.message ?? 'Invalid access token');
}
