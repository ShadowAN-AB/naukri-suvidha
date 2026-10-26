import { AppError } from '@naukri-suvidha/service-kit';

import { env } from './env.js';
import { logger } from './logger.js';

/**
 * This service's calls into the API, and the only place the boundary is
 * crossed from this side.
 *
 * There are two of them and they want opposite things, which is why they are
 * not one helper:
 *
 *   createProfile  must succeed or the registration must not stand, so a
 *                  failure is propagated and the caller compensates.
 *   appendAudit    must never fail the request it is describing, so a failure
 *                  is logged and swallowed - exactly as it was when the audit
 *                  write was a local insert in a try/catch.
 *
 * Both carry the shared secret and the request id, so one id follows a
 * registration through both processes' logs.
 */

const configured = () => Boolean(env.API_INTERNAL_URL);

async function call(path, { method = 'POST', body, requestId, timeoutMs }) {
  // AbortSignal.timeout and not a race with setTimeout: this has to abort the
  // socket, not merely stop waiting for it. A registration that hangs because
  // the API is wedged should fail, not hold a connection open.
  const res = await fetch(`${env.API_INTERNAL_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-gateway-key': env.AUTH_GATEWAY_SECRET,
      ...(requestId ? { 'x-request-id': requestId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs ?? env.API_INTERNAL_TIMEOUT_MS),
  });
  return res;
}

/**
 * Create the Student or Company row that a new account implies.
 *
 * The profile lives in the API's database because Students and Companies are
 * the API's. That makes registration a write in two services with no
 * transaction spanning them - there is no distributed transaction to be had
 * here, and pretending otherwise is how you get an account with no profile.
 *
 * So the shape is a compensation: this service writes the user, asks the API
 * for the profile, and deletes the user if the API refuses. The caller does
 * the deleting, because only it knows what it created.
 *
 * The uniqueness check for a roll number happens on the API side, not here.
 * It owns the Students collection and the unique index on it, so it is the
 * only process that can answer the question without guessing - and it returns
 * the 409 with the field details the registration form needs.
 */
export async function createProfile(input, { userId, requestId }) {
  if (!configured()) {
    // Not an internal error: the deployment is incomplete, and saying so is
    // more useful than a 500 from a fetch to `undefined/internal/profiles`.
    throw AppError.unavailable(
      'Registration is unavailable: this service has no API to create the profile in.',
    );
  }

  let res;
  try {
    res = await call('/api/internal/profiles', { body: { ...input, userId }, requestId });
  } catch (err) {
    logger.error({ err, userId }, 'profile creation call failed');
    throw AppError.unavailable('Could not complete registration. Try again in a moment.');
  }

  if (res.ok) return (await res.json()).profile;

  const payload = await res.json().catch(() => null);
  const error = payload?.error;

  /*
   * Pass through only the refusals that mean something to the person
   * registering, and nothing else.
   *
   * A 409 is the one that matters: a roll number already taken, with
   * `details.rollNo` the form reads to put the message under the right input.
   * A 400 means the two services disagree about the schema, which is a bug,
   * but the field details still help more than they hurt.
   *
   * Everything else is deliberately *not* forwarded. An internal 404 or 500
   * is about the API's routing or its database, and relaying it verbatim both
   * confuses the person - the first version of this told them "No route for
   * POST /internal/profiles" - and tells an anonymous caller about a surface
   * they cannot reach. The detail belongs in the log, not the response.
   */
  if (res.status === 409 || res.status === 400) {
    throw new AppError(
      res.status,
      error?.code ?? 'CONFLICT',
      error?.message ?? 'Could not complete registration.',
      error?.details,
    );
  }

  logger.error(
    { status: res.status, code: error?.code, message: error?.message, userId },
    'the API refused to create a profile',
  );
  throw AppError.unavailable('Could not complete registration. Try again in a moment.');
}

/**
 * Append an entry to the API's audit log, best effort.
 *
 * The audit trail is the placement office's record and the admin screens read
 * it, so a login still has to show up there now that logging in happens in a
 * different process. Crossing a boundary does not change what this write is
 * worth: it was already wrapped in a try/catch that logged and carried on,
 * because an audit write must never fail the request it is describing.
 *
 * Not awaited by the caller, deliberately. Sign-in latency should not include
 * a second service's insert.
 */
export function appendAudit(entry, { requestId } = {}) {
  if (!configured()) return;
  call('/api/internal/audit', { body: entry, requestId })
    .then((res) => {
      if (!res.ok) logger.warn({ status: res.status, action: entry.action }, 'audit write refused');
    })
    .catch((err) => logger.error({ err, action: entry.action }, 'audit write failed'));
}
