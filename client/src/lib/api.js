/**
 * The one place a fetch is made.
 *
 * The access token lives in this module's memory, never in localStorage, so a
 * script injected into the page cannot read a credential that outlives the
 * tab. When a request comes back 401 because the token expired, the refresh
 * cookie is used to get a new one and the original request is retried once.
 */

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? `Request failed with ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code ?? 'UNKNOWN';
    this.requestId = body?.error?.requestId;
    this.details = body?.error?.details;
  }
}

let accessToken = null;
let onSessionLost = null;

export function setAccessToken(token) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}
export function setSessionLostHandler(fn) {
  onSessionLost = fn;
}

/** Endpoints that must never trigger a refresh-and-retry of their own. */
const NO_RETRY = ['/auth/refresh', '/auth/login', '/auth/register', '/auth/logout'];

/** Concurrent 401s share one refresh rather than each firing their own. */
let refreshInFlight = null;

async function refreshAccessToken() {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = await res.json();
      accessToken = data.accessToken;
      return data;
    } catch {
      return null;
    } finally {
      // Let the next 401 start a fresh attempt.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

async function rawRequest(path, { method, body, signal, isFormData }) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body && !isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    credentials: 'include',
    signal,
  });

  const text = await res.text();
  return { res, payload: parseBody(text, res.status) };
}

/**
 * The API always answers with JSON, but the things in front of it do not: a
 * gateway timeout or a cold start returns an HTML error page. Parsing that
 * blindly throws a SyntaxError that escapes as "Unexpected token '<'", which
 * tells the user nothing.
 */
function parseBody(text, status) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return {
      error: {
        code: 'BAD_GATEWAY',
        message:
          status >= 500
            ? 'The server is not responding properly. Try again in a moment.'
            : 'The server sent a response the app could not read.',
      },
    };
  }
}

export async function api(path, { method = 'GET', body, signal, isFormData = false } = {}) {
  let { res, payload } = await rawRequest(path, { method, body, signal, isFormData });

  if (res.status === 401 && !NO_RETRY.includes(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      ({ res, payload } = await rawRequest(path, { method, body, signal, isFormData }));
    } else {
      accessToken = null;
      onSessionLost?.();
    }
  }

  if (!res.ok) throw new ApiError(res.status, payload);
  return payload;
}

/** Used once on start-up to turn a refresh cookie back into a session. */
export async function bootstrapSession() {
  return refreshAccessToken();
}
