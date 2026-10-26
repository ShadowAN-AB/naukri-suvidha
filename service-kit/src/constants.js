/** Enumerations more than one service needs to agree on, letter for letter. */

export const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
});
export const USER_STATUS_VALUES = Object.values(USER_STATUS);

/**
 * The gateway's identity contract.
 *
 * In gateway mode the edge authenticates once - it asks the auth service to
 * introspect the bearer token - and forwards the result to the API in these
 * headers, so the API never verifies a token or reads the users collection.
 *
 * Two things make that safe, and it is worth being exact about both because
 * trusting a header is otherwise how an authorization bypass is built.
 *
 * First, nginx sets all four on *every* proxied request, including the
 * unauthenticated ones where it sets them empty. A header the proxy always
 * writes cannot be smuggled in by a client, because the client's value is
 * overwritten before the API sees it. Leaving one unset on any route would
 * pass the client's own version straight through.
 *
 * Second, PROOF carries a shared secret the API checks. That is what makes
 * network reachability insufficient on its own: the API publishes no host port
 * in compose and is a ClusterIP in Kubernetes, so the edge is the only way in,
 * but "unreachable" is a deployment property and this does not depend on it
 * staying true.
 *
 * Be clear about what PROOF is not. It is a bearer secret shared by the edge
 * and the API, not a per-request signature, so anything holding both the
 * secret and a route to the API can mint any identity. Signing the forwarded
 * identity - a short-lived JWS the API verifies, which is what AWS ALB's
 * X-Amzn-Oidc-Data and Envoy's ext_authz do - would remove that, and is the
 * upgrade path if this ever leaves a laptop.
 */
export const IDENTITY_HEADERS = Object.freeze({
  ID: 'x-auth-user-id',
  ROLE: 'x-auth-user-role',
  EMAIL: 'x-auth-user-email',
  PROOF: 'x-gateway-key',
});
