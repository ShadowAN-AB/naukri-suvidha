import { AppError, IDENTITY_HEADERS } from '@naukri-suvidha/service-kit';
import { timingSafeEqual } from 'node:crypto';

import { env } from './env.js';

/**
 * Gate for /internal/*: the caller must present the shared secret.
 *
 * Without it, introspection would let anything that can reach this process
 * turn a token into an identity, and nothing stops a browser reaching it
 * through the edge. The routes are not secret - obscurity is not the control -
 * the secret is.
 *
 * Compared in constant time. The comparison is not plausibly the weak link
 * here, but a secret compared with `!==` is the kind of detail that gets
 * copied into somewhere it does matter.
 */
export function internalOnly(req, _res, next) {
  const presented = req.get(IDENTITY_HEADERS.PROOF) ?? '';
  const expected = env.AUTH_GATEWAY_SECRET;

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length, so the lengths are folded into the result instead.
  const ok = a.length === b.length && timingSafeEqual(a, b);

  // 404 and not 403: a 403 would confirm that this route exists and that the
  // caller merely lacks the key, which is the same rule the rest of the
  // project follows for resources a caller may not see.
  if (!ok) return next(AppError.notFound(`No route for ${req.method} ${req.originalUrl}`));
  next();
}
