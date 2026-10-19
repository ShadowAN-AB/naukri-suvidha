import { describe, expect, it } from 'vitest';

import { api, auth, makeUser } from './helpers.js';
import { ROLES } from '../src/lib/constants.js';

describe('malformed input', () => {
  it('answers a non-ObjectId with 404, not a 500', async () => {
    const { token } = await makeUser(ROLES.ADMIN);
    const res = await api().get('/api/jobs/not-an-object-id').set(auth(token)).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    // The driver's own wording would tell a prober how ids are shaped.
    expect(JSON.stringify(res.body)).not.toContain('Cast to ObjectId');
  });

  it('answers a well-formed but unknown id with 404 too, identically', async () => {
    const { token } = await makeUser(ROLES.ADMIN);
    const res = await api().get('/api/jobs/000000000000000000000000').set(auth(token)).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('never returns a stack trace or a filesystem path', async () => {
    const { token } = await makeUser(ROLES.ADMIN);
    const res = await api().get('/api/resumes/zzz/file').set(auth(token));
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/node_modules|\/Users\/|at \w+ \(/);
  });
});

describe('security headers', () => {
  it('sets the helmet headers and no framing', async () => {
    const res = await api().get('/api/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['x-frame-options']).toBeTruthy();
  });

  it('gives every response a request id', async () => {
    const res = await api().get('/api/health').expect(200);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('does not advertise the framework', async () => {
    const res = await api().get('/api/health').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('rate limiting', () => {
  it('cuts off repeated failed logins', async () => {
    const attempts = [];
    for (let i = 0; i < 8; i++) {
      const res = await api()
        .post('/api/auth/login')
        .send({ email: 'nobody@nexus.test', password: 'WrongPass1' });
      attempts.push(res.status);
    }
    expect(attempts).toContain(429);
  });
});
