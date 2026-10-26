import { describe, expect, it } from 'vitest';

import { api, auth, makeUser } from './helpers.js';
import { ROLES } from '../src/lib/constants.js';

/*
 * What is left of this service's side of authentication once the auth service
 * owns credentials and sessions.
 *
 * Registration, login, refresh rotation and logout moved to
 * services/auth/test/auth.test.js, along with the checks that need the users
 * collection - a suspended account, a bumped tokenVersion - because only that
 * service can see it. The introspection tests there cover what the edge asks
 * on every request.
 *
 * These are the rules this service still enforces itself: that a request has
 * an identity before a route runs, and that the identity's role is allowed.
 */
describe('access control', () => {
  it('refuses a request with no token', async () => {
    await api().get('/api/profiles/me').expect(401);
  });

  it('refuses a malformed token', async () => {
    await api().get('/api/profiles/me').set(auth('not.a.token')).expect(401);
  });

  it('refuses a token signed with another secret', async () => {
    // Bearer mode still checks the signature; it is the *revocation* check
    // that moved, not the verification.
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJyb2xlIjoiYWRtaW4iLCJ2IjowLCJzdWIiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEifQ.' +
      'not-the-real-signature';
    await api().get('/api/admin/overview').set(auth(forged)).expect(401);
  });

  it('keeps a student out of an admin route', async () => {
    const { token } = await makeUser(ROLES.STUDENT);
    const res = await api().get('/api/admin/overview').set(auth(token)).expect(403);
    expect(res.body.error.message).toContain('admin');
  });

  it('lets an admin through', async () => {
    const { token } = await makeUser(ROLES.ADMIN);
    await api().get('/api/admin/overview').set(auth(token)).expect(200);
  });

  it('gives a student their own profile and nobody else’s', async () => {
    const { token, profile } = await makeUser(ROLES.STUDENT);
    const mine = await api().get('/api/profiles/me').set(auth(token)).expect(200);
    expect(mine.body.profile._id).toBe(String(profile._id));

    const other = await makeUser(ROLES.STUDENT);
    const theirs = await api().get('/api/profiles/me').set(auth(other.token)).expect(200);
    expect(theirs.body.profile._id).not.toBe(String(profile._id));
  });
});

/*
 * The internal surface exists for the auth service and must not be reachable
 * as an ordinary request. The edge refuses the prefix from outside as well;
 * these cover the second lock, which is the one that survives an edge config
 * being edited.
 */
describe('the internal surface', () => {
  it('is a 404 without the shared secret, not a 403', async () => {
    const res = await api().post('/api/internal/profiles').send({}).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('is a 404 even to an authenticated admin', async () => {
    // These routes are not privileged-user routes, they are service routes.
    // An admin's token is the wrong kind of credential for them entirely.
    const { token } = await makeUser(ROLES.ADMIN);
    await api().post('/api/internal/profiles').set(auth(token)).send({}).expect(404);
    await api().post('/api/internal/audit').set(auth(token)).send({}).expect(404);
  });
});
