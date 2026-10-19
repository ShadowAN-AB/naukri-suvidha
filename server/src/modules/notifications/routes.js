import { Router } from 'express';

import * as service from './service.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();
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
