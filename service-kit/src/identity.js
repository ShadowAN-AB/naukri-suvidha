import { timingSafeEqual } from 'node:crypto';

import { AppError } from './errors.js';
import { IDENTITY_HEADERS } from './constants.js';

/**
 * Where a service gets the identity of a caller.
 *
 * Shared because more than one service behind the gateway has authenticated
 * routes, and they must agree on what a forwarded identity looks like and what
 * proves it. A second copy of the comparison below is a second chance to get
 * an authorization check wrong, which is the worst kind of duplication there
 * is.
 *
 * Two strategies, chosen once at boot from `mode`:
 *
 *   gateway - the edge already authenticated the request, by asking the auth
 *             service, and forwarded the result. Used by every container
 *             stack. This is the real deployment.
 *   bearer  - verify the access token here and trust its claims. Used by
 *             `npm run dev` and the test suites, where there is no edge.
 *
 * The two are not equivalent and the difference is not hidden: bearer mode
 * cannot check revocation, because the users collection belongs to the auth
 * service. A suspended account keeps access until its access token expires.
 */
export function createIdentity({ mode, gatewaySecret, verifyAccessToken }) {
  /**
   * Read the identity the edge established.
   *
   * In this mode the token never reaches the service. nginx ran an
   * `auth_request` against the auth service, which verified the signature and
   * checked the row, and forwarded the answer in these headers. So this does
   * no crypto and no database work - the work was done once, at the edge, by
   * the service that owns the data.
   *
   * Two things stop a client simply sending these headers itself.
   *
   * The first is nginx: it sets all four on *every* proxied request, including
   * empty on the unauthenticated ones, so a client's own value is always
   * overwritten before a service sees it. That is a property of the edge
   * config, and a route added there without the headers would quietly undo it.
   *
   * The second is this function, which is why it does not rely on the first.
   * The proof header carries a shared secret, so reaching the port is not
   * enough. No service publishes a host port under compose and all are
   * ClusterIPs under Kubernetes, but "unreachable" is a deployment property
   * and an authorization check should not rest on one.
   *
   * What this is not: a per-request proof. Anything holding the secret and a
   * route to a service can claim any identity. A short-lived signed assertion
   * from the auth service - what Envoy's ext_authz and ALB's
   * X-Amzn-Oidc-Data carry - removes that, and is the upgrade path.
   */
  function gatewayIdentity(req) {
    const a = Buffer.from(req.get(IDENTITY_HEADERS.PROOF) ?? '');
    const b = Buffer.from(gatewaySecret ?? '');
    // timingSafeEqual throws on a length mismatch, which would leak the
    // length, so the lengths are folded into the result instead.
    if (!(a.length > 0 && a.length === b.length && timingSafeEqual(a, b))) {
      /*
       * Not 401. A 401 tells the client to refresh its token and try again,
       * which cannot help: nothing the client holds would fix this. It means a
       * request arrived without having been through the edge, or the edge and
       * this service disagree about the secret - an operator's problem, and
       * one that should look like a fault rather than an expired session.
       */
      throw AppError.forbidden('This request did not come through the gateway');
    }

    const id = req.get(IDENTITY_HEADERS.ID);
    const role = req.get(IDENTITY_HEADERS.ROLE);
    if (!id || !role) {
      // The edge forwarded no identity, so the request is anonymous. It
      // reaches here at all because the edge lets unauthenticated routes
      // through.
      throw AppError.unauthorized('Missing access token');
    }

    return { id, email: req.get(IDENTITY_HEADERS.EMAIL) ?? '', role };
  }

  /**
   * Verify the access token here, and trust what it says.
   *
   * Be exact about what it gives up. The signature and `exp` are in the token,
   * so a forged, tampered or expired token is still caught. What is no longer
   * caught is a suspended account or a session ended by signing out
   * everywhere: both bump state the token cannot know about, so access
   * survives until the token expires.
   */
  function bearerIdentity(req) {
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
    // putting it in would make every token carry a mutable field.
    return { id: String(claims.sub), email: '', role: claims.role };
  }

  const identify = mode === 'gateway' ? gatewayIdentity : bearerIdentity;

  /** Express middleware: attaches req.user, or rejects. */
  const requireAuth = async (req, _res, next) => {
    try {
      req.user = identify(req);
      next();
    } catch (err) {
      next(err);
    }
  };

  return { identify, requireAuth, gatewayIdentity, bearerIdentity, mode };
}

/**
 * Role gate. Always used after requireAuth; a missing req.user here is a
 * wiring mistake, not an anonymous request, so it is reported as a 401.
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `This area is for ${roles.join(' or ')} accounts. You are signed in as ${req.user.role}.`,
        ),
      );
    }
    next();
  };
}
