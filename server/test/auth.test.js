import { describe, expect, it } from 'vitest';

import { api, auth, makeUser } from './helpers.js';
import { ROLES } from '../src/lib/constants.js';
import { User } from '../src/modules/auth/model.js';

const validStudent = {
  role: 'student',
  email: 'new.student@nexus.test',
  password: 'Passw0rd1',
  name: 'New Student',
  rollNo: '2027CSE001',
  branch: 'CSE',
  batchYear: 2027,
  cgpa: 8.1,
};

describe('registration', () => {
  it('creates a student and returns a token', async () => {
    const res = await api().post('/api/auth/register').send(validStudent).expect(201);
    expect(res.body.user.role).toBe('student');
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('refuses a second account on the same email', async () => {
    await api().post('/api/auth/register').send(validStudent).expect(201);
    await api().post('/api/auth/register').send({ ...validStudent, rollNo: 'OTHER1' }).expect(409);
  });

  it('refuses a duplicate roll number', async () => {
    await api().post('/api/auth/register').send(validStudent).expect(201);
    const res = await api()
      .post('/api/auth/register')
      .send({ ...validStudent, email: 'other@nexus.test' })
      .expect(409);
    expect(res.body.error.details.rollNo).toBeTruthy();
  });

  it('refuses a self-service admin account', async () => {
    await api()
      .post('/api/auth/register')
      .send({ role: 'admin', email: 'evil@nexus.test', password: 'Passw0rd1' })
      .expect(400);
  });

  it('reports every bad field at once', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ ...validStudent, password: 'weak', cgpa: 44, branch: 'POTIONS' })
      .expect(400);
    expect(Object.keys(res.body.error.details).sort()).toEqual(['branch', 'cgpa', 'password']);
  });

  it('stores the hash, never the password', async () => {
    await api().post('/api/auth/register').send(validStudent).expect(201);
    const user = await User.findOne({ email: validStudent.email }).select('+passwordHash').lean();
    expect(user.passwordHash).not.toContain('Passw0rd1');
    expect(user.passwordHash.startsWith('$2')).toBe(true);
  });
});

describe('login', () => {
  it('rejects a wrong password without saying which half was wrong', async () => {
    const { user } = await makeUser(ROLES.STUDENT);
    const res = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'WrongPass1' })
      .expect(401);
    expect(res.body.error.message).toBe('Email or password is incorrect');
  });

  it('gives an unknown email the identical message', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: 'ghost@nexus.test', password: 'WrongPass1' })
      .expect(401);
    expect(res.body.error.message).toBe('Email or password is incorrect');
  });

  it('sets an httpOnly refresh cookie that script cannot read', async () => {
    const { user, password } = await makeUser(ROLES.STUDENT);
    const res = await api().post('/api/auth/login').send({ email: user.email, password }).expect(200);
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('nexus_rt='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/i);
  });

  it('refuses a suspended account', async () => {
    const { user, password } = await makeUser(ROLES.STUDENT);
    await User.updateOne({ _id: user._id }, { $set: { status: 'suspended' } });
    await api().post('/api/auth/login').send({ email: user.email, password }).expect(403);
  });
});

describe('access control', () => {
  it('refuses a request with no token', async () => {
    await api().get('/api/auth/me').expect(401);
  });

  it('refuses a malformed token', async () => {
    await api().get('/api/auth/me').set(auth('not.a.token')).expect(401);
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

  it('invalidates a token when tokenVersion moves', async () => {
    const { user, token } = await makeUser(ROLES.STUDENT);
    await api().get('/api/auth/me').set(auth(token)).expect(200);
    await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
    await api().get('/api/auth/me').set(auth(token)).expect(401);
  });
});
