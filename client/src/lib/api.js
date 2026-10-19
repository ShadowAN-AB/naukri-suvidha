/**
 * The one place a fetch is made. Every response is unwrapped the same way and
 * every failure becomes an ApiError carrying the server's code and requestId,
 * so a UI error message and a log line can be matched up.
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

export async function api(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include', // the refresh token lives in an httpOnly cookie
    signal,
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (!res.ok) throw new ApiError(res.status, payload);
  return payload;
}
