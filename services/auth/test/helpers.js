import http from 'node:http';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { ROLES } from '@naukri-suvidha/shared';

import { createApp } from '../src/app.js';
import { env } from '../src/env.js';
import { User } from '../src/model.js';

export const app = createApp();
export const api = () => request(app);

const PASSWORD = 'Passw0rd1';

/**
 * A stub for the API's /internal/profiles.
 *
 * Registration is a write in two services, so testing it needs the other one.
 * A real HTTP stub rather than a mocked fetch, because what is under test is
 * the crossing itself: the timeout, the status pass-through, and above all the
 * compensation when the far side refuses.
 *
 * `profileStub.reply` is what each test sets to decide what the API "says".
 */
export const profileStub = {
  reply: { status: 201, body: { profile: { kind: 'student' } } },
  calls: [],
  reset() {
    this.reply = { status: 201, body: { profile: { kind: 'student' } } };
    this.calls = [];
  },
};

let server = null;

export async function startProfileStub() {
  const port = Number(new URL(env.API_INTERNAL_URL).port);
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      profileStub.calls.push({
        url: req.url,
        key: req.headers['x-gateway-key'],
        requestId: req.headers['x-request-id'],
        body: raw ? JSON.parse(raw) : null,
      });
      // /internal/audit is fire-and-forget; accept it and say nothing.
      if (req.url === '/api/internal/audit') {
        res.writeHead(204).end();
        return;
      }
      const { status, body, delayMs } = profileStub.reply;
      const send = () => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body ?? {}));
      };
      if (delayMs) setTimeout(send, delayMs).unref();
      else send();
    });
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
}

export async function stopProfileStub() {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
}

/** A user straight in the database, bypassing registration. */
export async function makeUser(role = ROLES.STUDENT, overrides = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const user = await User.create({
    email: overrides.email ?? `${role}-${suffix}@naukrisuvidha.test`,
    role,
    passwordHash: await bcrypt.hash(PASSWORD, 10),
    ...(overrides.status ? { status: overrides.status } : {}),
  });
  return { user, password: PASSWORD };
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });
export const internal = () => ({ 'x-gateway-key': env.AUTH_GATEWAY_SECRET });
