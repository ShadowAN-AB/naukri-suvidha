import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

import { EVENTS } from '@naukri-suvidha/service-kit';

import { EmailLog } from '../src/model.js';

// Mock the two side effects before importing the module under test, so the
// handler's imports reach the mocks.
vi.mock('../src/transport.js', () => ({
  sendMail: vi.fn(),
  verify: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../src/identity.js', () => ({
  getUserEmail: vi.fn(),
}));
vi.mock('../src/consumer.js', () => {
  // Capture whatever handler consumers.js registers, so the test can call it
  // directly. The real consumer wires this to Kafka; here it just records.
  const registered = new Map();
  return {
    on: (event, name, handler) => registered.set(name, { event, handler }),
    handlerFor: (name) => registered.get(name)?.handler,
    kafkaEnabled: () => false,
    start: async () => {},
    close: async () => {},
    __registered: registered,
  };
});

const { sendMail } = await import('../src/transport.js');
const { getUserEmail } = await import('../src/identity.js');
const { registerConsumers } = await import('../src/consumers.js');
const consumer = await import('../src/consumer.js');

registerConsumers();
const handler = consumer.__registered.get('email:interview-scheduled').handler;

const payload = () => ({
  interviewId: new mongoose.Types.ObjectId().toString(),
  applicationId: new mongoose.Types.ObjectId().toString(),
  scheduledAt: new Date('2026-11-15T10:30:00Z').toISOString(),
  mode: 'online',
  jobTitle: 'Software Engineer',
  studentUserId: new mongoose.Types.ObjectId().toString(),
});

beforeEach(() => {
  sendMail.mockReset();
  getUserEmail.mockReset();
});

describe('interview.scheduled handler', () => {
  it('resolves the email, sends it, and writes a sent row', async () => {
    getUserEmail.mockResolvedValue('student@uni.test');
    sendMail.mockResolvedValue({
      to: 'student@uni.test',
      originalTo: 'student@uni.test',
      overrideApplied: false,
      messageId: '<msg-1@test>',
    });

    const p = payload();
    await handler(p);

    expect(getUserEmail).toHaveBeenCalledWith(p.studentUserId);
    expect(sendMail).toHaveBeenCalledTimes(1);

    const call = sendMail.mock.calls[0][0];
    expect(call.to).toBe('student@uni.test');
    expect(call.subject).toContain('Software Engineer');
    expect(call.text).toMatch(/online interview/i);
    expect(call.html).toContain('Software Engineer');

    const log = await EmailLog.findOne({ eventKey: `interview:${p.interviewId}` }).lean();
    expect(log.status).toBe('sent');
    expect(log.messageId).toBe('<msg-1@test>');
    expect(log.to).toBe('student@uni.test');
    expect(log.originalTo).toBe('student@uni.test');
    expect(log.overrideApplied).toBe(false);
  });

  it('short-circuits a redelivery of the same event (idempotency)', async () => {
    // The property the whole handler rests on: Kafka's at-least-once means the
    // same event comes back, and a second SMTP send is a second email in a
    // student's inbox - which is the kind of silent failure the unique index
    // on eventKey exists to prevent.
    getUserEmail.mockResolvedValue('student@uni.test');
    sendMail.mockResolvedValue({
      to: 'student@uni.test',
      originalTo: 'student@uni.test',
      overrideApplied: false,
      messageId: '<msg-2@test>',
    });

    const p = payload();
    await handler(p);
    await handler(p); // same interviewId -> same eventKey -> short-circuit

    expect(sendMail).toHaveBeenCalledTimes(1);
    const rows = await EmailLog.find({ eventKey: `interview:${p.interviewId}` }).lean();
    expect(rows).toHaveLength(1);
  });

  it('records a skipped row when the recipient cannot be resolved', async () => {
    // Null from getUserEmail covers two real cases: no AUTH_SERVICE_URL (dev
    // run) and a user that no longer exists (auth returned 404). Both mean "do
    // not guess an address" - the honest outcome is a visible skipped row.
    getUserEmail.mockResolvedValue(null);

    const p = payload();
    await handler(p);

    expect(sendMail).not.toHaveBeenCalled();
    const log = await EmailLog.findOne({ eventKey: `interview:${p.interviewId}` }).lean();
    expect(log.status).toBe('skipped');
    expect(log.lastError).toMatch(/no email/i);
  });

  it('records a failed row and rethrows so the retry worker picks it up', async () => {
    getUserEmail.mockResolvedValue('student@uni.test');
    sendMail.mockRejectedValue(new Error('SMTP connection refused'));

    const p = payload();
    await expect(handler(p)).rejects.toThrow(/SMTP connection refused/);

    const log = await EmailLog.findOne({ eventKey: `interview:${p.interviewId}` }).lean();
    expect(log.status).toBe('failed');
    expect(log.lastError).toMatch(/SMTP connection refused/);
  });

  it('logs both originalTo and the overridden to when the override is applied', async () => {
    // The transport applies DEMO_EMAIL_OVERRIDE and returns both addresses.
    // The handler must write both to the log row so the override is visible
    // rather than silent - that pair is why `originalTo` exists in the schema.
    getUserEmail.mockResolvedValue('student@uni.test');
    sendMail.mockResolvedValue({
      to: 'demo@me.test',
      originalTo: 'student@uni.test',
      overrideApplied: true,
      messageId: '<msg-3@test>',
    });

    const p = payload();
    await handler(p);

    const log = await EmailLog.findOne({ eventKey: `interview:${p.interviewId}` }).lean();
    expect(log.to).toBe('demo@me.test');
    expect(log.originalTo).toBe('student@uni.test');
    expect(log.overrideApplied).toBe(true);
  });

  it('event names and consumer group are what every other service agrees on', () => {
    // The group id is a cross-service contract: if this ever drifted, the
    // notifications handler and this one would compete for events instead of
    // each getting their own copy. Pinned here where it is testable.
    expect(EVENTS.INTERVIEW_SCHEDULED).toBe('interview.scheduled');
    expect(consumer.__registered.has('email:interview-scheduled')).toBe(true);
  });
});
