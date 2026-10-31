import { Router } from 'express';
import { loginSchema, registerSchema } from '@naukri-suvidha/shared';
import { validate } from '@naukri-suvidha/service-kit';

import * as controller from './controller.js';
import { internalOnly } from './internalOnly.js';
import { loginLimiter, registerLimiter } from './rateLimit.js';

const router = Router();

/*
 * The public surface, unchanged from when these lived in the monolith - same
 * paths, same methods, same bodies, same errors. The edge mounts this router
 * under /api/auth, so the client cannot tell that a different process answers
 * now, which is the test of whether the gateway is doing its job.
 *
 * /me is deliberately absent. It used to return the user *and* their student
 * or company profile, and the profile half was always the API's data; the
 * client only ever read the profile half. It is /api/profiles/me now, which
 * already existed and already returned exactly that.
 */
router.post('/register', registerLimiter, validate(registerSchema), controller.register);
router.post('/login', loginLimiter, validate(loginSchema), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);

export default router;

/**
 * The service-to-service surface, mounted separately so the edge can refuse
 * it from outside. Everything here requires the shared secret.
 */
export const internalRouter = Router();

internalRouter.use(internalOnly);

/*
 * Both verbs, and that is not laziness.
 *
 * nginx's `auth_request` always issues a **GET** subrequest, whatever the
 * method of the request that triggered it, and drops the body - so a POST-only
 * introspection endpoint answers 404 to the gateway, which reports it as
 * "auth request unexpected status: 404" and turns every API request into a
 * 500. GET is the better fit anyway: introspection reads a header and changes
 * nothing.
 *
 * POST stays because a service-to-service caller may reasonably prefer to send
 * the token in a body rather than a header.
 */
internalRouter.get('/introspect', controller.introspect);
internalRouter.post('/introspect', controller.introspect);

/*
 * Added for the email service's getUserEmail call. GET and POST for the same
 * reason as introspect: no reason to force a verb when the data is just a URL
 * parameter, and symmetry across the internal surface is easier for a reader
 * than per-endpoint rules. The id goes in the URL rather than the body because
 * it is the only parameter and because an id-shaped URL is cacheable at the
 * edge if that ever becomes useful.
 */
internalRouter.get('/users/:id/email', controller.userEmail);
internalRouter.post('/users/:id/email', controller.userEmail);
