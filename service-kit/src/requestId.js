import { randomUUID } from 'node:crypto';

/**
 * Attaches a stable id to every request so a log line, an error response and a
 * support question can all be tied to the same request.
 *
 * It reads an incoming `x-request-id` before minting one, which is what makes
 * it work across a service boundary: the gateway stamps an id, the API logs
 * it, and a call the API makes onward to the auth service carries the same id
 * - so one id follows a request through every process that touched it.
 */
export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
