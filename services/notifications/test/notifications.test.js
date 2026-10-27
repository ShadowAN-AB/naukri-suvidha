import { beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { registerConsumers } from '../src/consumers.js';
import { handlerFor } from '../src/consumer.js';
import { Notification } from '../src/model.js';
import { NOTIFICATION_TYPE } from '../src/constants.js';
import { signAccessToken } from './helpers.js';

const app = createApp();
const api = () => request(app);

// Registered once for the file: the names are the consumer groups, so
// registering twice is a duplicate-name error by design.
registerConsumers();

const userId = () => new mongoose.Types.ObjectId();
const auth = (id, role = 'student') => ({
  Authorization: `Bearer ${signAccessToken({ _id: id, role, tokenVersion: 0 })}`,
});

/*
 * The property the whole extraction rests on: every handler acts on its event
 * alone.
 *
 * This database has no students, no jobs and no companies - there is nowhere
 * for a handler to look anything up even if it tried. So calling the handlers
 * directly with a payload is not a shortcut around a broker; it is the honest
 * test of the thing that had to become true before this service could exist.
 * A Kafka round trip here would be a test of kafkajs.
 */
describe('handlers act on their event alone', () => {
  it('job.approved tells the recruiter the event named', async () => {
    const recruiter = userId();
    await handlerFor('notifications:job-approved')({
      jobId: String(userId()),
      recruiterUserId: String(recruiter),
      title: 'Platform Engineer',
    });

    const row = await Notification.findOne({ userId: recruiter }).lean();
    expect(row.type).toBe(NOTIFICATION_TYPE.JOB_APPROVED);
    expect(row.body).toContain('Platform Engineer');
    expect(row.readAt).toBeNull();
  });

  it('application.submitted names the student in the recruiter’s notification', async () => {
    const recruiter = userId();
    await handlerFor('notifications:application-submitted')({
      recruiterUserId: String(recruiter),
      jobTitle: 'Data Analyst',
      studentName: 'Aarav Kaur',
    });

    const row = await Notification.findOne({ userId: recruiter }).lean();
    expect(row.body).toContain('Aarav Kaur');
    expect(row.body).toContain('Data Analyst');
  });

  it('application.status_changed uses the copy for the status', async () => {
    const student = userId();
    await handlerFor('notifications:application-status-changed')({
      applicationId: String(userId()),
      jobId: String(userId()),
      status: 'offered',
      jobTitle: 'Backend Engineer',
      studentUserId: String(student),
    });

    const row = await Notification.findOne({ userId: student }).lean();
    expect(row.title).toBe('You have an offer');
    expect(row.body).toContain('Backend Engineer');
  });

  it('resume.processed says so differently when the fallback produced it', async () => {
    const student = userId();
    await handlerFor('notifications:resume-processed')({
      resumeId: String(userId()),
      fallback: true,
      studentUserId: String(student),
    });

    const row = await Notification.findOne({ userId: student }).lean();
    expect(row.title).toMatch(/with limits/);
  });

  it('interview.scheduled carries the time and the mode', async () => {
    const student = userId();
    await handlerFor('notifications:interview-scheduled')({
      scheduledAt: new Date('2026-12-01T10:00:00Z'),
      mode: 'online',
      jobTitle: 'SRE',
      studentUserId: String(student),
    });

    const row = await Notification.findOne({ userId: student }).lean();
    expect(row.type).toBe(NOTIFICATION_TYPE.INTERVIEW_SCHEDULED);
    expect(row.body).toContain('online');
    expect(row.body).toContain('SRE');
  });

  it('writes nothing when the event carried no audience', async () => {
    // A publisher bug rather than a missing user. It must not throw - a throw
    // would queue a retry that can never succeed - and it must not invent a
    // notification addressed to nobody.
    await handlerFor('notifications:job-approved')({ jobId: String(userId()), title: 'X' });
    expect(await Notification.countDocuments()).toBe(0);
  });

  it('subscribes to exactly the five events it handles', () => {
    for (const name of [
      'notifications:job-approved',
      'notifications:application-submitted',
      'notifications:application-status-changed',
      'notifications:resume-processed',
      'notifications:interview-scheduled',
    ]) {
      expect(typeof handlerFor(name)).toBe('function');
    }
    expect(handlerFor('notifications:nothing')).toBeUndefined();
  });
});

describe('the inbox', () => {
  let student;

  beforeEach(async () => {
    student = userId();
    // Explicit, distinct timestamps: created in one call they land in the
    // same millisecond, and "newest first" over a tie is not an order.
    await Notification.create([
      {
        userId: student,
        type: NOTIFICATION_TYPE.JOB_APPROVED,
        title: 'One',
        createdAt: new Date('2026-10-01T09:00:00Z'),
      },
      {
        userId: student,
        type: NOTIFICATION_TYPE.RESUME_PROCESSED,
        title: 'Two',
        createdAt: new Date('2026-10-02T09:00:00Z'),
      },
    ]);
  });

  it('returns a user’s own notifications, newest first, with an unread count', async () => {
    const res = await api().get('/').set(auth(student)).expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.unread).toBe(2);
    expect(res.body.items[0].title).toBe('Two');
  });

  it('never returns another user’s', async () => {
    const res = await api().get('/').set(auth(userId())).expect(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.unread).toBe(0);
  });

  it('marks one read, and refuses one that is not yours', async () => {
    const mine = await Notification.findOne({ userId: student }).lean();

    await api().post(`/${mine._id}/read`).set(auth(student)).expect(200);
    expect((await Notification.findById(mine._id).lean()).readAt).toBeTruthy();

    // 404 and not 403: a 403 would confirm the notification exists.
    await api().post(`/${mine._id}/read`).set(auth(userId())).expect(404);
  });

  it('marks all read, and counts only what it changed', async () => {
    const res = await api().post('/read-all').set(auth(student)).expect(200);
    expect(res.body.marked).toBe(2);

    const again = await api().post('/read-all').set(auth(student)).expect(200);
    expect(again.body.marked).toBe(0);
  });

  it('refuses an unauthenticated request', async () => {
    await api().get('/').expect(401);
  });
});

describe('health', () => {
  it('reports that it has no broker, rather than looking fine', async () => {
    // The one way this service can be completely healthy and useless.
    const res = await api().get('/health').expect(200);
    expect(res.body.service).toBe('notifications');
    expect(res.body.events).toBe('no broker configured');
    expect(res.body.push).toMatch(/unavailable/);
  });
});
