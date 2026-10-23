import { Router } from 'express';
import { jobCreateSchema, jobUpdateSchema, jobRejectSchema, jobListQuerySchema } from '@naukri-suvidha/shared';

import * as service from './service.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { ROLES } from '../../lib/constants.js';

const router = Router();
router.use(requireAuth);

router.get('/', validate(jobListQuerySchema, 'query'), async (req, res, next) => {
  try {
    res.json(await service.listJobs(req.user, req.query));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireRole(ROLES.RECRUITER),
  validate(jobCreateSchema),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createJob(req.user, req.body, req.ip));
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id', async (req, res, next) => {
  try {
    res.json(await service.getJob(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requireRole(ROLES.RECRUITER, ROLES.ADMIN),
  validate(jobUpdateSchema),
  async (req, res, next) => {
    try {
      res.json(await service.updateJob(req.user, req.params.id, req.body, req.ip));
    } catch (err) {
      next(err);
    }
  },
);

router.post('/:id/approve', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    res.json(await service.approveJob(req.user, req.params.id, req.ip));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/reject',
  requireRole(ROLES.ADMIN),
  validate(jobRejectSchema),
  async (req, res, next) => {
    try {
      res.json(await service.rejectJob(req.user, req.params.id, req.body.reason, req.ip));
    } catch (err) {
      next(err);
    }
  },
);

router.post('/:id/close', requireRole(ROLES.RECRUITER, ROLES.ADMIN), async (req, res, next) => {
  try {
    res.json(await service.closeJob(req.user, req.params.id, req.ip));
  } catch (err) {
    next(err);
  }
});

export default router;
