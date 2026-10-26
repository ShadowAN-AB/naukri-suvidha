import { AppError, IDENTITY_HEADERS } from '@naukri-suvidha/service-kit';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * This service's calls into the auth service.
 *
 * There is exactly one, and it is not on the HTTP request path - that is what
 * the edge's `auth_request` is for. It is here because the socket handshake is
 * the one entry point the edge cannot authenticate.
 */

const configured = () => Boolean(env.AUTH_SERVICE_URL);

async function call(path, { headers, requestId } = {}) {
  return fetch(`${env.AUTH_SERVICE_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [IDENTITY_HEADERS.PROOF]: env.AUTH_GATEWAY_SECRET ?? '',
      ...(requestId ? { 'x-request-id': requestId } : {}),
      ...headers,
    },
    signal: AbortSignal.timeout(env.AUTH_SERVICE_TIMEOUT_MS),
  });
}

/**
 * Introspect a token for the socket gateway.
 *
 * A Socket.IO handshake carries its token in the connection payload, not an
 * Authorization header, and the edge proxies /socket.io straight through -
 * there is no `auth_request` on a websocket upgrade. So the one request in the
 * system that the edge cannot authenticate is authenticated from here instead,
 * against the same endpoint, getting the same answer.
 *
 * Returns null when there is no auth service to ask, which is bearer mode -
 * the caller verifies the token itself there.
 */
export async function introspectToken(token) {
  if (!configured()) return null;

  let res;
  try {
    res = await call('/internal/introspect', {
      headers: { authorization: `Bearer ${token}` },
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
