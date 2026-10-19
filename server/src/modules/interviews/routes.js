import { Router } from 'express';
import { interviewScheduleSchema, interviewRescheduleSchema } from '@nexus/shared';

import * as service from './service.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { ROLES } from '../../lib/constants.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    res.json(await service.list(req.user));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireRole(ROLES.RECRUITER, ROLES.ADMIN),
  validate(interviewScheduleSchema),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.schedule(req.user, req.body, req.ip));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/:id',
  requireRole(ROLES.RECRUITER, ROLES.ADMIN),
  validate(interviewRescheduleSchema),
  async (req, res, next) => {
    try {
      res.json(await service.reschedule(req.user, req.params.id, req.body, req.ip));
    } catch (err) {
      next(err);
    }
  },
);

router.post('/:id/cancel', requireRole(ROLES.RECRUITER, ROLES.ADMIN), async (req, res, next) => {
  try {
    res.json(await service.cancel(req.user, req.params.id, req.ip));
  } catch (err) {
    next(err);
  }
});

export default router;
