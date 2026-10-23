import { Router } from 'express';
import { studentProfileUpdateSchema, companyProfileUpdateSchema, ROLES } from '@naukri-suvidha/shared';

import * as service from './service.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../middleware/error.js';

const router = Router();

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json(await service.getMyProfile(req.user));
  } catch (err) {
    next(err);
  }
});

/** The body is validated against whichever schema matches the caller's role. */
function validateByRole(req, res, next) {
  if (req.user.role === ROLES.STUDENT) return validate(studentProfileUpdateSchema)(req, res, next);
  if (req.user.role === ROLES.RECRUITER) return validate(companyProfileUpdateSchema)(req, res, next);
  return next(AppError.forbidden('Admin accounts have no profile to edit'));
}

router.patch('/me', requireAuth, validateByRole, async (req, res, next) => {
  try {
    res.json(await service.updateMyProfile(req.user, req.body));
  } catch (err) {
    next(err);
  }
});

export default router;
