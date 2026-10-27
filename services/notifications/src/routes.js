import { Router } from 'express';

import * as service from './service.js';
import { requireAuth } from './identity.js';

const router = Router();

/*
 * The inbox. Same three routes, same shapes, same paths as before - the edge
 * mounts this under /api/notifications, so the client cannot tell that a
 * different process answers now. That is the test of whether the gateway is
 * doing its job, and the client is unchanged.
 */
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    res.json(await service.listForUser(req.user.id));
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    res.json(await service.markAllRead(req.user.id));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    res.json(await service.markRead(req.user.id, req.params.id));
  } catch (err) {
    next(err);
  }
});

export default router;
