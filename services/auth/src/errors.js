import { createErrorHandler } from '@naukri-suvidha/service-kit';

import { isProd } from './env.js';
import { logger } from './logger.js';

// The same handler the API builds, from the same factory, so a 409 from here
// and a 409 from there are the same response to a client that cannot tell
// which one answered.
export const errorHandler = createErrorHandler({ isProd, logger });
