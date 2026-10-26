import { Router } from 'express';
import { loginSchema, registerSchema } from '@naukri-suvidha/shared';
import { validate } from '@naukri-suvidha/service-kit';

import * as controller from './controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { loginLimiter, registerLimiter } from '../../middleware/rateLimit.js';

const router = Router();

router.post('/register', registerLimiter, validate(registerSchema), controller.register);
router.post('/login', loginLimiter, validate(loginSchema), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', requireAuth, controller.me);

export default router;
