/**
 * One error shape for the whole system: `{ error: { code, message,
 * requestId, details? } }`.
 *
 * It was already a project rule when there was one process. With two it
 * becomes a contract instead of a convention - the client cannot tell which
 * service answered, so a 409 from the auth service has to read exactly like a
 * 409 from the API or the error handling in `client/src/lib/api.js` has to
 * learn about services, which is precisely what a gateway exists to prevent.
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
  static unauthorized(message = 'Authentication required', details) {
    return new AppError(401, 'UNAUTHORIZED', message, details);
  }
  // Takes details like the others: a 403 often needs to say *why*, such as
  // which eligibility rule a student failed.
  static forbidden(message = 'You do not have access to this resource', details) {
    return new AppError(403, 'FORBIDDEN', message, details);
  }
  static notFound(message = 'Not found', details) {
    return new AppError(404, 'NOT_FOUND', message, details);
  }
  static conflict(message, details) {
    return new AppError(409, 'CONFLICT', message, details);
  }
  static tooLarge(message = 'Payload too large', details) {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', message, details);
  }
  /**
   * A service this one depends on did not answer. 503 and not 500: the
   * request was fine and retrying it may well work, which is a different
   * thing to tell a client than "this is broken".
   */
  static unavailable(message = 'A dependency is unavailable', details) {
    return new AppError(503, 'SERVICE_UNAVAILABLE', message, details);
  }
}

export function notFound(req, _res, next) {
  next(AppError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

/**
 * Mongoose throws for things that are really bad input, not server faults.
 * Left alone they surface as 500s, which is the wrong answer, fills the error
 * log with stack traces from people mistyping a URL, and hides genuine faults
 * among the noise.
 */
function translateDriverError(err) {
  // An id that is not an ObjectId cannot name anything, so it is a 404.
  // Answering 400 would confirm that the route and the id format are real.
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return AppError.notFound('Not found');
  }
  if (err.name === 'ValidationError') {
    const details = Object.fromEntries(
      Object.entries(err.errors ?? {}).map(([k, v]) => [k, v.message]),
    );
    return AppError.badRequest('Some fields need fixing', details);
  }
  // A unique index that a service did not anticipate.
  if (err.code === 11000) {
    return AppError.conflict('That already exists');
  }
  return err;
}

/**
 * Build the handler for one service. `isProd` and `logger` are arguments for
 * the same reason the token functions are: each service resolves its own
 * environment, and a module that read a global `env` here would depend on
 * import order to know whether it had one.
 */
export function createErrorHandler({ isProd, logger }) {
  // Express identifies an error handler by its arity, so _next must stay.
  return function errorHandler(rawError, req, res, _next) {
    const err = translateDriverError(rawError);
    const status = err.status ?? 500;
    const code = err.code ?? 'INTERNAL_ERROR';

    // 4xx is already reported by the request logger; only a real fault needs
    // a stack trace, and only once.
    if (status >= 500) {
      logger.error({ err, requestId: req.id }, 'unhandled error');
    }

    res.status(status).json({
      error: {
        code,
        message: status >= 500 && isProd ? 'Something went wrong' : err.message,
        ...(err.details ? { details: err.details } : {}),
        requestId: req.id,
      },
    });
  };
}
