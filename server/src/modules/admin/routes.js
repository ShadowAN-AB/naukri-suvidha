import { Router } from 'express';

import * as service from './service.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { ROLES } from '../../lib/constants.js';

const router = Router();
router.use(requireAuth, requireRole(ROLES.ADMIN));

router.get('/overview', async (_req, res, next) => {
  try {
    res.json(await service.overview());
  } catch (err) {
    next(err);
  }
});

router.get('/analytics', async (_req, res, next) => {
  try {
    res.json(await service.analytics());
  } catch (err) {
    next(err);
  }
});

router.get('/audit', async (req, res, next) => {
  try {
    res.json(
      await service.auditLog({
        limit: Math.min(Number(req.query.limit) || 50, 200),
        action: req.query.action,
      }),
    );
  } catch (err) {
    next(err);
  }
});

export default router;
