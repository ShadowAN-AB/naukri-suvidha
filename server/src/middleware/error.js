import { createErrorHandler } from '@naukri-suvidha/service-kit';
import { isProd } from '../config/env.js';
import { logger } from '../config/logger.js';

// The error type and the driver-error translation are shared, so a 404 from
// this service and a 404 from the auth service are the same response. Only
// the two things that are per-service - whether to hide a 500's message, and
// where to log it - are supplied here.
export { AppError, notFound } from '@naukri-suvidha/service-kit';

export const errorHandler = createErrorHandler({ isProd, logger });
