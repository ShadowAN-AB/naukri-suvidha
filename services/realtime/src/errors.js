import { createErrorHandler } from '@naukri-suvidha/service-kit';
import { isProd } from './env.js';
import { logger } from './logger.js';

export const errorHandler = createErrorHandler({ isProd, logger });
