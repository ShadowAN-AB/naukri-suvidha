import { timingSafeEqual } from 'node:crypto';
import { AppError, IDENTITY_HEADERS } from '@naukri-suvidha/service-kit';

import { env } from '../../config/env.js';

/**
 * Read the identity the edge established.
 *
 * In this mode the token never reaches here. nginx ran an `auth_request`
 * against the auth service, which verified the signature and checked the row,
 * and forwarded the answer in these headers. So this does no crypto and no
 * database work - the work was done once, at the edge, by the service that
 * owns the data.
 *
 * Two things stop a client simply sending these headers itself.
 *
 * The first is nginx: it sets all four on *every* proxied request, including
 * empty on the unauthenticated ones, so a client's own value is always
 * overwritten before this service sees it. That is a property of the edge
 * config, and a route added there without the headers would quietly undo it.
 *
 * The second is this function, which is why it does not rely on the first.
 * The proof header carries a shared secret, so reaching this port is not
 * enough. The API publishes no host port under compose and is a ClusterIP
 * under Kubernetes, but "unreachable" is a deployment property and an
 * authorization check should not rest on one.
 *
 * What this is not: a per-request proof. Anything holding the secret and a
 * route here can claim any identity. A short-lived signed assertion from the
 * auth service - what Envoy's ext_authz and ALB's X-Amzn-Oidc-Data carry -
 * removes that, and is the upgrade path. It is not built because one shared
 * secret between three processes on one machine is the honest size of this
 * deployment, and a signature nobody rotates is not obviously better.
 */
export function gatewayIdentity(req) {
  const presented = req.get(IDENTITY_HEADERS.PROOF) ?? '';
  const expected = env.AUTH_GATEWAY_SECRET;

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would leak the length,
  // so the lengths are folded into the result instead.
  if (!(a.length === b.length && timingSafeEqual(a, b))) {
    /*
     * Not 401. A 401 tells the client to refresh its token and try again,
     * which cannot help: nothing the client holds would fix this. It means a
     * request arrived without having been through the edge, or the edge and
     * this service disagree about the secret - an operator's problem, and one
     * that should look like a fault rather than an expired session.
     */
    throw AppError.forbidden('This request did not come through the gateway');
  }

  const id = req.get(IDENTITY_HEADERS.ID);
  const role = req.get(IDENTITY_HEADERS.ROLE);
  if (!id || !role) {
    // The edge forwarded no identity, so the request is anonymous. It reaches
    // here at all because the edge lets unauthenticated routes through.
    throw AppError.unauthorized('Missing access token');
  }

  return { id, email: req.get(IDENTITY_HEADERS.EMAIL) ?? '', role };
}
