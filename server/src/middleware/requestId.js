import { randomUUID } from 'node:crypto';

/**
 * Attaches a stable id to every request so a log line, an error response and a
 * support question can all be tied to the same request.
 */
export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}
