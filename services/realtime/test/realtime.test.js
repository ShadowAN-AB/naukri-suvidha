import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { io as connect } from 'socket.io-client';

import { roomForUser } from '@naukri-suvidha/service-kit';

import { createApp } from '../src/app.js';
import { closeSockets, emitToUser, initSockets } from '../src/sockets.js';
import { signAccessToken } from '../src/tokens.js';

/*
 * The handshake is the only thing in this service worth testing, and it is
 * worth testing properly: it is the one entry point in the whole system that
 * the API gateway cannot authenticate. A websocket upgrade carries no
 * Authorization header and nginx has no `auth_request` for it, so if this
 * check is wrong there is nothing behind it.
 *
 * A real server on a real port with a real client, rather than the socket
 * server mocked. What is being tested is whether a token is accepted and
 * whether the connection lands in the right room, and both of those are
 * socket.io's behaviour as much as ours.
 */
let server;
let url;

const token = (id, role = 'student') =>
  signAccessToken({ _id: id, role, tokenVersion: 0 });

const open = (auth) =>
  new Promise((resolve, reject) => {
    const socket = connect(url, {
      auth,
      transports: ['websocket'],
      reconnection: false,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
  });

beforeAll(async () => {
  const app = createApp();
  await new Promise((ready) => {
    server = app.listen(0, ready);
  });
  initSockets(server);
  url = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await closeSockets();
  await new Promise((done) => server.close(done));
});

describe('the socket handshake', () => {
  it('accepts a signed access token and joins only that user’s room', async () => {
    const id = String(new mongoose.Types.ObjectId());
    const socket = await open({ token: token(id) });

    const got = new Promise((resolve) => socket.on('notification:new', resolve));
    // Emitted locally here; in a deployment this arrives from the API or the
    // notifications service through the Redis adapter, into the same room.
    expect(emitToUser(id, 'notification:new', { title: 'hello' })).toBe(true);

    expect(await got).toEqual({ title: 'hello' });
    socket.disconnect();
  });

  it('does not deliver one user’s events to another', async () => {
    const mine = String(new mongoose.Types.ObjectId());
    const theirs = String(new mongoose.Types.ObjectId());
    const socket = await open({ token: token(mine) });

    let leaked = false;
    socket.on('notification:new', () => {
      leaked = true;
    });

    emitToUser(theirs, 'notification:new', { title: 'not yours' });
    // One room per connection is the whole isolation mechanism, so this is
    // the assertion that matters most in the file.
    await new Promise((done) => setTimeout(done, 150));

    expect(leaked).toBe(false);
    socket.disconnect();
  });

  it('refuses a handshake with no token', async () => {
    await expect(open({})).rejects.toThrow(/Missing access token/);
  });

  it('refuses a handshake with a token it cannot verify', async () => {
    await expect(open({ token: 'not-a-jwt' })).rejects.toThrow(/Invalid token/);
  });

  it('rooms are named the way the other services publish to them', () => {
    // The room format is a cross-service contract: notifications and the API
    // address rooms they do not hold. A local rename here would silently stop
    // their pushes arriving, with nothing failing in either process.
    const id = String(new mongoose.Types.ObjectId());
    expect(roomForUser(id)).toBe(`user:${id}`);
  });
});

describe('GET /health', () => {
  it('reports the push path and no database', async () => {
    const res = await request(server).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.service).toBe('realtime');
    // No `db` field at all: this service owns no data, and a field reporting
    // on nothing would be worse than its absence.
    expect(res.body.db).toBeUndefined();
    // REDIS_URL is unset in .env.test, so the degradation must be visible
    // rather than inferred from pushes that never arrive.
    expect(res.body.push).toMatch(/unavailable/);
    expect(res.body.sockets.up).toBe(true);
  });

  it('stays 200 while the process is listening, unlike the other services', async () => {
    // Deliberate: readiness here cannot depend on Redis. Pulling this pod
    // from the Service would drop every open socket to signal that pushes are
    // not arriving - trading a working channel for a broken one.
    const res = await request(server).get('/health');
    expect(res.status).toBe(200);
  });
});
