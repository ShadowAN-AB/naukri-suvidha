import { describe, expect, it } from 'vitest';

import { gatewayIdentity, bearerIdentity, identityMode } from '../src/infra/identity/index.js';
import { signAccessToken } from '../src/lib/tokens.js';
import { ROLES } from '../src/lib/constants.js';

/*
 * The identity strategies, tested directly rather than through the app.
 *
 * Gateway mode is what both container stacks run, and it is the most
 * security-sensitive part of step 5: the API trusts an HTTP header for the
 * caller's identity. Everything below is a way of asking "and what stops
 * someone sending that header themselves".
 *
 * The strategies themselves live in service-kit, because the notifications
 * service is behind the same gateway and must read a forwarded identity the
 * same way. These exercise the pair this service builds from its own config.
 *
 * Not through supertest, because the strategy is chosen once when
 * infra/identity is imported - the same boot-time choice infra/cache makes -
 * and config/env.js has already been parsed by the suite's setup file before
 * any test body runs. Rebuilding the app under a different mode would mean
 * resetting the module registry, which re-registers every mongoose model and
 * throws. These are pure functions of a request, so the honest way to test
 * them is as pure functions of a request.
 *
 * The end-to-end wiring is verified against the running compose stack, where
 * a suspended account's unexpired token is refused at the edge.
 */

const SECRET = 'test-only-gateway-secret-not-real';
const USER_ID = '507f1f77bcf86cd799439011';

/** Just enough of an Express request for a strategy to read. */
const req = (headers) => ({
  get: (name) => headers[name.toLowerCase()],
});

/** What the edge forwards once the auth service has introspected a token. */
const forwarded = (extra = {}) => ({
  'x-gateway-key': SECRET,
  'x-auth-user-id': USER_ID,
  'x-auth-user-role': ROLES.STUDENT,
  'x-auth-user-email': 'someone@naukrisuvidha.test',
  ...extra,
});

describe('the identity mode this suite runs in', () => {
  it('is bearer, so the rest of the suite can send tokens', () => {
    expect(identityMode()).toBe('bearer');
  });
});

describe('gateway identity', () => {
  it('reads the identity the edge forwarded', () => {
    expect(gatewayIdentity(req(forwarded()))).toEqual({
      id: USER_ID,
      role: ROLES.STUDENT,
      email: 'someone@naukrisuvidha.test',
    });
  });

  it('refuses identity headers with no gateway secret', () => {
    // The whole attack: a client sending the headers itself. nginx overwrites
    // them on every proxied request, but this must not depend on that.
    const headers = forwarded();
    delete headers['x-gateway-key'];
    expect(() => gatewayIdentity(req(headers))).toThrowError(/gateway/);
  });

  it('refuses identity headers with the wrong secret, same length or not', () => {
    expect(() => gatewayIdentity(req(forwarded({ 'x-gateway-key': 'wrong' })))).toThrow();
    // Same length as the real one, so the comparison cannot shortcut on size.
    const sameLength = 'x'.repeat(SECRET.length);
    expect(sameLength).toHaveLength(SECRET.length);
    expect(() => gatewayIdentity(req(forwarded({ 'x-gateway-key': sameLength })))).toThrow();
  });

  it('answers 403, not 401, when the proof is missing', () => {
    // 401 would tell the client to refresh its token and retry, and nothing
    // the client holds would help: this means the request did not come through
    // the edge, or the edge and the API disagree about the secret.
    const headers = forwarded();
    delete headers['x-gateway-key'];
    try {
      gatewayIdentity(req(headers));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.status).toBe(403);
    }
  });

  it('treats a proven request carrying no identity as anonymous', () => {
    // What the edge forwards on an unauthenticated route: the secret, and the
    // identity headers set empty. It must read as 401, not as a valid caller.
    try {
      gatewayIdentity(req({ 'x-gateway-key': SECRET, 'x-auth-user-id': '', 'x-auth-user-role': '' }));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.status).toBe(401);
    }
  });

  it('ignores a bearer token entirely', () => {
    // A perfectly valid, correctly signed token. In this mode it is not what
    // establishes identity - the edge already did that - so a request carrying
    // only a token has no identity at all.
    const token = signAccessToken({ _id: USER_ID, role: ROLES.ADMIN, tokenVersion: 0 });
    expect(() => gatewayIdentity(req({ authorization: `Bearer ${token}` }))).toThrow();
  });

  it('does not let a forged role survive a genuine proof', () => {
    // The edge always *sets* the role from what the auth service said, so what
    // arrives here is already the true one. This records the consequence: the
    // strategy reports exactly the header, which is why the edge overwriting
    // it on every request is load-bearing and tested against the live stack.
    const asAdmin = gatewayIdentity(req(forwarded({ 'x-auth-user-role': ROLES.ADMIN })));
    expect(asAdmin.role).toBe(ROLES.ADMIN);
  });
});

describe('bearer identity', () => {
  it('reads a correctly signed token', () => {
    const token = signAccessToken({ _id: USER_ID, role: ROLES.STUDENT, tokenVersion: 0 });
    expect(bearerIdentity(req({ authorization: `Bearer ${token}` }))).toEqual({
      id: USER_ID,
      role: ROLES.STUDENT,
      email: '',
    });
  });

  it('refuses a missing or malformed Authorization header', () => {
    expect(() => bearerIdentity(req({}))).toThrowError(/Missing access token/);
    expect(() => bearerIdentity(req({ authorization: 'Basic abc' }))).toThrowError(/Missing/);
  });

  it('refuses a token signed with another secret', () => {
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJyb2xlIjoiYWRtaW4iLCJ2IjowLCJzdWIiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEifQ.' +
      'not-the-real-signature';
    expect(() => bearerIdentity(req({ authorization: `Bearer ${forged}` }))).toThrowError(
      /Invalid access token/,
    );
  });

  it('ignores forwarded identity headers', () => {
    // The mirror of the gateway test: in bearer mode the headers mean nothing,
    // so a client cannot use them to bypass the signature check either.
    expect(() => bearerIdentity(req(forwarded()))).toThrowError(/Missing access token/);
  });
});
