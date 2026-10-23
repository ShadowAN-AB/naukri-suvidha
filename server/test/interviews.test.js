import { describe, expect, it } from 'vitest';

import { api, auth, makeJob, makeUser } from './helpers.js';
import { ROLES, APPLICATION_STATUS, INTERVIEW_STATUS } from '../src/lib/constants.js';
import { Application } from '../src/modules/applications/model.js';
import { Interview } from '../src/modules/interviews/model.js';

/** A recruiter, a student, and a shortlisted application between them. */
async function shortlisted(sharedStudent) {
  const recruiter = await makeUser(ROLES.RECRUITER);
  const student = sharedStudent ?? (await makeUser(ROLES.STUDENT));
  const job = await makeJob(recruiter.profile);
  const application = await Application.create({
    jobId: job._id,
    studentId: student.profile._id,
    status: APPLICATION_STATUS.SHORTLISTED,
  });
  return { recruiter, student, application };
}

const at = (hoursFromNow) => new Date(Date.now() + hoursFromNow * 3600_000).toISOString();

const book = (recruiter, application, when, extra = {}) =>
  api()
    .post('/api/interviews')
    .set(auth(recruiter.token))
    .send({
      applicationId: String(application._id),
      scheduledAt: when,
      durationMinutes: 60,
      mode: 'phone',
      ...extra,
    });

describe('scheduling an interview', () => {
  it('books a shortlisted applicant', async () => {
    const { recruiter, application } = await shortlisted();
    const res = await book(recruiter, application, at(24)).expect(201);
    expect(res.body.status).toBe(INTERVIEW_STATUS.SCHEDULED);
  });

  it('refuses a second interview for the same application', async () => {
    const { recruiter, application } = await shortlisted();
    await book(recruiter, application, at(24)).expect(201);

    const res = await book(recruiter, application, at(96)).expect(409);
    expect(res.body.error.message).toMatch(/already has an interview/i);
    expect(await Interview.countDocuments({ applicationId: application._id })).toBe(1);
  });

  it('refuses a slot overlapping one the student already has elsewhere', async () => {
    const first = await shortlisted();
    // The same student, shortlisted by a different company for a different job.
    const second = await shortlisted(first.student);

    await book(first.recruiter, first.application, at(24)).expect(201);

    // Starts 30 minutes into the first hour-long interview.
    const res = await book(second.recruiter, second.application, at(24.5)).expect(409);
    expect(res.body.error.details.scheduledAt).toMatch(/clashes/i);
  });

  it('allows a slot that only touches the end of another', async () => {
    const first = await shortlisted();
    const second = await shortlisted(first.student);

    await book(first.recruiter, first.application, at(24)).expect(201);
    // Starts exactly when the first one ends, so the ranges do not overlap.
    await book(second.recruiter, second.application, at(25)).expect(201);
  });

  it('lets a cancelled application be booked again', async () => {
    const { recruiter, application } = await shortlisted();
    const made = await book(recruiter, application, at(24)).expect(201);

    await api()
      .post(`/api/interviews/${made.body._id}/cancel`)
      .set(auth(recruiter.token))
      .expect(200);

    // The unique index is partial, so the cancelled row no longer holds the slot.
    await book(recruiter, application, at(48)).expect(201);
  });
});

describe('rescheduling', () => {
  it('moves an interview without clashing with itself', async () => {
    const { recruiter, application } = await shortlisted();
    const made = await book(recruiter, application, at(24)).expect(201);

    const res = await api()
      .patch(`/api/interviews/${made.body._id}`)
      .set(auth(recruiter.token))
      .send({ scheduledAt: at(24.25) })
      .expect(200);
    expect(new Date(res.body.scheduledAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses a move onto another of the student’s interviews', async () => {
    const first = await shortlisted();
    const second = await shortlisted(first.student);

    await book(first.recruiter, first.application, at(24)).expect(201);
    const movable = await book(second.recruiter, second.application, at(72)).expect(201);

    const res = await api()
      .patch(`/api/interviews/${movable.body._id}`)
      .set(auth(second.recruiter.token))
      .send({ scheduledAt: at(24.5) })
      .expect(409);
    expect(res.body.error.details.scheduledAt).toMatch(/clashes/i);
  });
});
