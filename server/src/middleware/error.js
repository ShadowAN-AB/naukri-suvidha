import { isProd } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * The one error type the application throws on purpose. Anything else reaching
 * the handler below is a bug and is reported as a 500.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new AppError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Not found') {
    return new AppError(404, 'NOT_FOUND', message);
  }
  static conflict(message, details) {
    return new AppError(409, 'CONFLICT', message, details);
  }
  static tooLarge(message = 'Payload too large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', message);
  }
}

export function notFound(req, _res, next) {
  next(AppError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars -- Express identifies the handler by arity
export function errorHandler(err, req, res, _next) {
  const status = err.status ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';

  if (status >= 500) {
    logger.error({ err, requestId: req.id }, 'unhandled error');
  } else {
    logger.warn({ code, msg: err.message, requestId: req.id }, 'request failed');
  }

  res.status(status).json({
    error: {
      code,
      message: status >= 500 && isProd ? 'Something went wrong' : err.message,
      ...(err.details ? { details: err.details } : {}),
      requestId: req.id,
    },
  });
}
