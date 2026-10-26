import { timingSafeEqual } from 'node:crypto';
import { AppError, IDENTITY_HEADERS } from '@naukri-suvidha/service-kit';

import { env } from '../../config/env.js';

/**
 * Gate for /api/internal/*: the caller must hold the shared secret.
 *
 * These routes exist for the auth service and nothing else. They write a
 * profile and append an audit row on behalf of a caller whose identity has
 * *not* been established by the edge - registration happens before there is
 * anyone to be - so they cannot use requireAuth, and they must not be open.
 *
 * The edge refuses /api/internal/ from outside as well, so this is the second
 * of two locks rather than the only one. Both are here on purpose: the edge's
 * rule is one line in an nginx config, and one line is an easy thing to lose.
 */
export function internalOnly(req, _res, next) {
  const expected = env.AUTH_GATEWAY_SECRET;
  if (!expected) {
    // No secret configured means bearer mode - a single-process development
    // run, where nothing is calling these and nothing should be able to.
    return next(AppError.notFound(`No route for ${req.method} ${req.originalUrl}`));
  }

  const a = Buffer.from(req.get(IDENTITY_HEADERS.PROOF) ?? '');
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);

  // 404, not 403: a 403 would confirm the route is real and the caller is
  // merely missing a key. Same rule the rest of the project follows.
  if (!ok) return next(AppError.notFound(`No route for ${req.method} ${req.originalUrl}`));
  next();
}
