import { Router } from 'express';
import { applySchema, changeStatusSchema, applicationListQuerySchema } from '@nexus/shared';

import * as service from './service.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { ROLES } from '../../lib/constants.js';

const router = Router();
router.use(requireAuth);

router.get('/', validate(applicationListQuerySchema, 'query'), async (req, res, next) => {
  try {
    res.json(await service.listApplications(req.user, req.query));
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole(ROLES.STUDENT), validate(applySchema), async (req, res, next) => {
  try {
    res.status(201).json(await service.apply(req.user, req.body.jobId, req.ip));
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/status',
  requireRole(ROLES.RECRUITER, ROLES.ADMIN),
  validate(changeStatusSchema),
  async (req, res, next) => {
    try {
      res.json(await service.changeStatus(req.user, req.params.id, req.body, req.ip));
    } catch (err) {
      next(err);
    }
  },
);

router.post('/:id/withdraw', requireRole(ROLES.STUDENT), async (req, res, next) => {
  try {
    res.json(await service.withdraw(req.user, req.params.id, req.ip));
  } catch (err) {
    next(err);
  }
});

export default router;
