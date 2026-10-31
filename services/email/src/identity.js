import { AppError, IDENTITY_HEADERS } from '@naukri-suvidha/service-kit';

import { env } from './env.js';
import { logger } from './logger.js';

/**
 * This service's one call into the auth service.
 *
 * Modelled on `services/realtime/src/identity.js`, and for the same shape of
 * reason: student emails live in `naukri_suvidha_auth.users`, so the service
 * that sends to them has to ask the service that owns them. The crossing is
 * the fourth in the system, documented in CLAUDE.md.
 *
 * It is deliberately NOT bidirectional - this service never writes to auth,
 * never introspects a token (nothing calls this service), only reads the one
 * field it needs.
 */

const configured = () => Boolean(env.AUTH_SERVICE_URL);

/**
 * Resolve the email of a user by id.
 *
 * Returns `null` when there is no auth service to ask: a laptop dev run
 * without the auth service running still boots, and the handler records a
 * `skipped` row rather than failing. In containers both are up or the gate in
 * the deployment stops this service starting.
 *
 * Throws a retriable error on transport failures (so the retry worker gets a
 * second chance when auth is temporarily down), and a terminal error on 4xx
 * from auth itself (so a request against a user that no longer exists is not
 * retried for ten minutes).
 */
export async function getUserEmail(userId) {
  if (!configured()) return null;

  let res;
  try {
    res = await fetch(`${env.AUTH_SERVICE_URL}/internal/users/${encodeURIComponent(userId)}/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [IDENTITY_HEADERS.PROOF]: env.AUTH_GATEWAY_SECRET ?? '',
      },
      signal: AbortSignal.timeout(env.AUTH_SERVICE_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ err, userId }, 'auth service unreachable for an email lookup');
    throw AppError.unavailable('Could not reach the auth service');
  }

  if (res.ok) {
    const body = await res.json().catch(() => null);
    return body?.email ?? null;
  }

  if (res.status === 404) {
    // A user that is not there is not a retry: it is skipped at the handler.
    return null;
  }

  const payload = await res.json().catch(() => null);
  throw AppError.unavailable(payload?.error?.message ?? 'Email lookup refused');
}
