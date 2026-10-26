import { Router } from 'express';
import { registerSchema } from '@naukri-suvidha/shared';
import { AppError, validate } from '@naukri-suvidha/service-kit';
import { z } from 'zod';

import { internalOnly } from './gate.js';
import { ROLES } from '../../lib/constants.js';
import { Student, Company } from '../profiles/model.js';
import { AuditLog } from '../admin/model.js';
import { logger } from '../../config/logger.js';

/**
 * The service-to-service surface, for the auth service.
 *
 * Two routes, and they are the whole price of the boundary in this direction.
 * Registration has to write a Student or Company, which are this service's
 * collections; and a login has to appear in the audit trail, which is this
 * service's too.
 *
 * They are not a general-purpose internal API and should not become one. Each
 * one is here because a specific piece of data lives on this side and the
 * caller has no way to reach it - which is the test to apply before adding a
 * third.
 */
const router = Router();

router.use(internalOnly);

/*
 * The profile half of registration.
 *
 * The body is the same payload the registration form submitted, plus the id of
 * the user the auth service just created, so it is validated against the same
 * schema - imported from shared, not restated. Validating again here is not
 * belt-and-braces: this is a trust boundary, and the only reason the far side
 * validated is that it happened to.
 */
const internalProfileSchema = registerSchema.and(
  z.object({ userId: z.string().regex(/^[0-9a-f]{24}$/, 'userId must be an ObjectId') }),
);

router.post('/profiles', validate(internalProfileSchema), async (req, res, next) => {
  const input = req.body;
  try {
    /*
     * The roll-number clash is detected here because the unique index is here.
     * Checked first for the message, and then relied on by the catch below for
     * correctness - two registrations in the same instant both pass the read
     * and only the index can separate them.
     */
    if (input.role === ROLES.STUDENT) {
      const clash = await Student.findOne({ rollNo: input.rollNo }).lean();
      if (clash) {
        throw AppError.conflict('That roll number is already registered', {
          rollNo: 'That roll number is already registered',
        });
      }
    }

    const profile =
      input.role === ROLES.STUDENT
        ? await Student.create({
            userId: input.userId,
            name: input.name,
            phone: input.phone || undefined,
            rollNo: input.rollNo,
            branch: input.branch,
            batchYear: input.batchYear,
            cgpa: input.cgpa,
            backlogs: input.backlogs ?? 0,
          })
        : await Company.create({
            userId: input.userId,
            name: input.companyName,
            website: input.website || undefined,
            industry: input.industry || undefined,
          });

    res.status(201).json({ profile });
  } catch (err) {
    if (err.code === 11000) {
      // The index caught what the read above could not: a concurrent
      // registration with the same roll number.
      return next(
        AppError.conflict('That roll number is already registered', {
          rollNo: 'That roll number is already registered',
        }),
      );
    }
    next(err);
  }
});

/*
 * An audit row on behalf of the auth service, so a sign-in still shows up in
 * the placement office's trail now that signing in happens elsewhere.
 *
 * 202 and not 201: the caller does not wait for this and must not be made to
 * care whether it landed. An audit write has never been allowed to fail the
 * request it describes.
 */
const internalAuditSchema = z.object({
  actorId: z.string().regex(/^[0-9a-f]{24}$/).optional(),
  action: z.string().min(1).max(64),
  entity: z.string().min(1).max(64),
  entityId: z.string().regex(/^[0-9a-f]{24}$/).optional(),
  ip: z.string().max(64).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

router.post('/audit', validate(internalAuditSchema), async (req, res) => {
  try {
    await AuditLog.create(req.body);
  } catch (err) {
    logger.error({ err, action: req.body.action }, 'audit write failed');
  }
  res.status(202).end();
});

export default router;
