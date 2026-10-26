import { identify } from '../infra/identity/index.js';

/**
 * Attaches req.user, from whichever source IDENTITY_MODE selected.
 *
 * This used to verify the token and then re-read the user from the database to
 * check the account was still active. Both halves moved: the verifying to the
 * edge, and the re-reading to the auth service, which is the only process that
 * can still do it. What is left is the part that was always this service's
 * job - deciding that a request has an identity before a route runs.
 *
 * Route guards in the client remain convenience; every rule is still enforced
 * here, on the server.
 */
export async function requireAuth(req, _res, next) {
  try {
    req.user = identify(req);
    next();
  } catch (err) {
    next(err);
  }
}
