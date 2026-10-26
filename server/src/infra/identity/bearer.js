import { AppError } from '@naukri-suvidha/service-kit';

import { verifyAccessToken } from '../../lib/tokens.js';

/**
 * Verify the access token here, and trust what it says.
 *
 * This is the development and test mode, and it exists so that `npm run dev`
 * and `npm test` need one process and a mongod - the same reason REDIS_URL and
 * KAFKA_BROKERS are optional.
 *
 * Be exact about what it gives up. The old requireAuth did two things: it
 * verified the signature, and then it re-read the user to check the account was
 * still active and the token version still current. The second check needed the
 * users collection, which this service no longer has. So:
 *
 *   still caught  a forged or tampered token, an expired one, a missing one.
 *                 The signature and `exp` are in the token itself.
 *   no longer     a suspended account, and a session ended by signing out
 *   caught        everywhere. Both bump state the token cannot know about, so
 *                 access survives until the token expires - ACCESS_TOKEN_TTL,
 *                 fifteen minutes.
 *
 * That window is why this is not the production mode. It is not closed by
 * calling the auth service from here either: doing that on every request is
 * precisely what gateway mode does, once, at the edge, where the answer can be
 * reused for the whole request rather than fetched per service.
 */
export function bearerIdentity(req) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw AppError.unauthorized('Missing access token');
  }

  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch (err) {
    throw AppError.unauthorized(
      err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token',
    );
  }

  // `email` is not in the access token - it was never needed there, and
  // putting it in would make every token carry a mutable field. Nothing on the
  // request path reads it; the one caller that wants it asks the auth service.
  return { id: String(claims.sub), email: '', role: claims.role };
}
