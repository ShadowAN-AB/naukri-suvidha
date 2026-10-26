import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ROLES } from '@naukri-suvidha/shared';

import {
  api,
  bearer,
  internal,
  makeUser,
  profileStub,
  startProfileStub,
  stopProfileStub,
} from './helpers.js';
import { RefreshToken, User } from '../src/model.js';

beforeAll(startProfileStub);
afterAll(stopProfileStub);
beforeEach(() => profileStub.reset());

const validStudent = {
  role: 'student',
  email: 'new.student@naukrisuvidha.test',
  password: 'Passw0rd1',
  name: 'New Student',
  rollNo: '2027CSE001',
  branch: 'CSE',
  batchYear: 2027,
  cgpa: 8.1,
};

describe('registration', () => {
  it('creates a student and returns a token', async () => {
    const res = await api().post('/register').send(validStudent).expect(201);
    expect(res.body.user.role).toBe('student');
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('refuses a second account on the same email', async () => {
    await api().post('/register').send(validStudent).expect(201);
    await api().post('/register').send({ ...validStudent, rollNo: 'OTHER1' }).expect(409);
  });

  it('refuses a self-service admin account', async () => {
    await api()
      .post('/register')
      .send({ role: 'admin', email: 'evil@naukrisuvidha.test', password: 'Passw0rd1' })
      .expect(400);
  });

  it('reports every bad field at once', async () => {
    const res = await api()
      .post('/register')
      .send({ ...validStudent, password: 'weak', cgpa: 44, branch: 'POTIONS' })
      .expect(400);
    expect(Object.keys(res.body.error.details).sort()).toEqual(['branch', 'cgpa', 'password']);
  });

  it('stores the hash, never the password', async () => {
    await api().post('/register').send(validStudent).expect(201);
    const user = await User.findOne({ email: validStudent.email }).select('+passwordHash').lean();
    expect(user.passwordHash).not.toContain('Passw0rd1');
    expect(user.passwordHash.startsWith('$2')).toBe(true);
  });
});

/*
 * Registration is the one write that spans both services, so these cover the
 * crossing rather than the validation: what is sent, what comes back, and what
 * is undone when the far side refuses.
 */
describe('registration across the service boundary', () => {
  it('asks the API for the profile, with the secret and the request id', async () => {
    const res = await api().post('/register').send(validStudent).expect(201);

    const call = profileStub.calls.find((c) => c.url === '/api/internal/profiles');
    expect(call).toBeTruthy();
    expect(call.key).toBe('test-only-gateway-secret-not-real');
    // The same id the response carries, so one registration can be followed
    // through both processes' logs.
    expect(call.requestId).toBe(res.headers['x-request-id']);
    expect(call.body.rollNo).toBe(validStudent.rollNo);
    expect(call.body.userId).toBe(res.body.user.id);
  });

  it('passes the API’s duplicate-roll-number refusal straight through', async () => {
    // The API owns the Students collection and its unique index, so it is the
    // one that detects this - and its field details are what the form reads.
    profileStub.reply = {
      status: 409,
      body: {
        error: {
          code: 'CONFLICT',
          message: 'That roll number is already registered',
          details: { rollNo: 'That roll number is already registered' },
        },
      },
    };

    const res = await api().post('/register').send(validStudent).expect(409);
    expect(res.body.error.details.rollNo).toBeTruthy();
  });

  it('deletes the user again when the profile cannot be created', async () => {
    profileStub.reply = { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'nope' } } };

    // 503, not the API's 500: an internal fault is not forwarded verbatim.
    const res = await api().post('/register').send(validStudent).expect(503);
    expect(JSON.stringify(res.body)).not.toContain('internal');

    // The compensation: no transaction spans the two services, so a refused
    // profile has to leave nothing behind. Otherwise the email is taken by an
    // account that can sign in and has nothing to sign in to.
    expect(await User.countDocuments({ email: validStudent.email })).toBe(0);
  });

  it('frees the email for a second attempt after a failed one', async () => {
    profileStub.reply = { status: 500, body: {} };
    await api().post('/register').send(validStudent).expect(503);

    profileStub.reset();
    await api().post('/register').send(validStudent).expect(201);
  });

  it('answers 503, and leaves no user, when the API does not answer in time', async () => {
    // Longer than API_INTERNAL_TIMEOUT_MS, so the abort fires.
    profileStub.reply = { status: 201, body: {}, delayMs: 4000 };

    const res = await api().post('/register').send(validStudent).expect(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(await User.countDocuments({ email: validStudent.email })).toBe(0);
  });
});

describe('login', () => {
  it('rejects a wrong password without saying which half was wrong', async () => {
    const { user } = await makeUser(ROLES.STUDENT);
    const res = await api()
      .post('/login')
      .send({ email: user.email, password: 'WrongPass1' })
      .expect(401);
    expect(res.body.error.message).toBe('Email or password is incorrect');
  });

  it('gives an unknown email the identical message', async () => {
    const res = await api()
      .post('/login')
      .send({ email: 'ghost@naukrisuvidha.test', password: 'WrongPass1' })
      .expect(401);
    expect(res.body.error.message).toBe('Email or password is incorrect');
  });

  it('sets an httpOnly refresh cookie that script cannot read', async () => {
    const { user, password } = await makeUser(ROLES.STUDENT);
    const res = await api().post('/login').send({ email: user.email, password }).expect(200);
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('naukri_suvidha_rt='));
    expect(cookie).toMatch(/HttpOnly/i);
    // Scoped to where the *browser* sees this service, through the edge - not
    // to this service's own route table.
    expect(cookie).toMatch(/Path=\/api\/auth/i);
  });

  it('refuses a suspended account', async () => {
    const { user, password } = await makeUser(ROLES.STUDENT);
    await User.updateOne({ _id: user._id }, { $set: { status: 'suspended' } });
    await api().post('/login').send({ email: user.email, password }).expect(403);
  });
});

/*
 * Introspection is what the whole extraction turns on: the edge calls it once
 * per request and the API trusts the answer, so every refusal the API used to
 * make itself has to be made here instead.
 */
describe('introspection', () => {
  async function tokenFor(role = ROLES.STUDENT, overrides = {}) {
    const { user, password } = await makeUser(role, overrides);
    const res = await api().post('/login').send({ email: user.email, password }).expect(200);
    return { user, token: res.body.accessToken };
  }

  it('turns a valid token into an identity, in headers and in the body', async () => {
    const { user, token } = await tokenFor();
    const res = await api()
      .post('/internal/introspect')
      .set({ ...internal(), ...bearer(token) })
      .expect(200);

    // Headers, because nginx auth_request can only read headers - it throws
    // the body away. The body is for the socket handshake, which introspects
    // directly because a Socket.IO handshake never passes through the edge's
    // auth_request.
    expect(res.headers['x-auth-user-id']).toBe(String(user._id));
    expect(res.headers['x-auth-user-role']).toBe('student');
    expect(res.headers['x-auth-user-email']).toBe(user.email);
    expect(res.body.user.id).toBe(String(user._id));
  });

  it('refuses a missing token', async () => {
    await api().post('/internal/introspect').set(internal()).expect(401);
  });

  it('refuses a malformed token', async () => {
    await api()
      .post('/internal/introspect')
      .set({ ...internal(), ...bearer('not.a.token') })
      .expect(401);
  });

  it('refuses a token signed with the wrong secret', async () => {
    // A forged token is the case the signature check exists for, and it has to
    // be caught here now - the API no longer looks at signatures in gateway
    // mode.
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJyb2xlIjoiYWRtaW4iLCJ2IjowLCJzdWIiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEifQ.' +
      'wrong-signature-entirely';
    await api()
      .post('/internal/introspect')
      .set({ ...internal(), ...bearer(forged) })
      .expect(401);
  });

  it('refuses a suspended account holding a still-valid token', async () => {
    const { user, token } = await tokenFor();
    await User.updateOne({ _id: user._id }, { $set: { status: 'suspended' } });
    await api()
      .post('/internal/introspect')
      .set({ ...internal(), ...bearer(token) })
      .expect(403);
  });

  it('invalidates a token when tokenVersion moves', async () => {
    const { user, token } = await tokenFor();
    await api()
      .post('/internal/introspect')
      .set({ ...internal(), ...bearer(token) })
      .expect(200);

    await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
    await api()
      .post('/internal/introspect')
      .set({ ...internal(), ...bearer(token) })
      .expect(401);
  });

  it('is a 404 without the shared secret, not a 403', async () => {
    const { token } = await tokenFor();
    // A 403 would confirm the route exists and that the caller merely lacks
    // the key. Anything that can reach this port must not be able to turn a
    // token into an identity.
    await api().post('/internal/introspect').set(bearer(token)).expect(404);
    await api()
      .post('/internal/introspect')
      .set({ 'x-gateway-key': 'wrong', ...bearer(token) })
      .expect(404);
  });
});

/** The refresh cookie's value, as the browser would send it back. */
const refreshCookie = (res) => {
  const raw = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('naukri_suvidha_rt='));
  return raw ? raw.split(';')[0].slice('naukri_suvidha_rt='.length) : null;
};

const refreshWith = (token) =>
  api().post('/refresh').set('Cookie', `naukri_suvidha_rt=${token}`);

async function signedIn() {
  const { user, password } = await makeUser(ROLES.STUDENT);
  const res = await api().post('/login').send({ email: user.email, password }).expect(200);
  return { user, token: refreshCookie(res) };
}

describe('refresh token rotation', () => {
  it('hands back a different token each time', async () => {
    const { token } = await signedIn();

    const res = await refreshWith(token).expect(200);
    const next = refreshCookie(res);

    expect(next).toBeTruthy();
    expect(next).not.toBe(token);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('retires the token it just exchanged', async () => {
    const { token } = await signedIn();
    await refreshWith(token).expect(200);

    // The same cookie a second time is a replay, not a retry.
    await refreshWith(token).expect(401);
  });

  it('revokes the whole session when a retired token is replayed', async () => {
    const { token } = await signedIn();
    const live = refreshCookie(await refreshWith(token).expect(200));

    // Someone replays the old one: the successor must die with it, because we
    // cannot tell which holder is the thief.
    await refreshWith(token).expect(401);
    await refreshWith(live).expect(401);
  });

  it('stores only a hash of the token', async () => {
    const { token } = await signedIn();
    const rows = await RefreshToken.find().lean();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(row.tokenHash).not.toBe(token);
    }
  });

  it('ends the session on logout', async () => {
    const { token } = await signedIn();
    await api().post('/logout').set('Cookie', `naukri_suvidha_rt=${token}`).expect(204);

    await refreshWith(token).expect(401);
  });

  it('logs out cleanly with no cookie at all', async () => {
    await api().post('/logout').expect(204);
  });
});

describe('rate limiting', () => {
  it('cuts off repeated failed logins', async () => {
    const attempts = [];
    for (let i = 0; i < 8; i++) {
      const res = await api()
        .post('/login')
        .send({ email: 'nobody@naukrisuvidha.test', password: 'WrongPass1' });
      attempts.push(res.status);
    }
    expect(attempts).toContain(429);
  });
});
