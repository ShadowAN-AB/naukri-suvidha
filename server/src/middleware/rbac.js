import { AppError } from './error.js';

/**
 * Role gate. Always used after requireAuth; a missing req.user here is a
 * wiring mistake, not an anonymous request, so it is reported as a 401.
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `This area is for ${roles.join(' or ')} accounts. You are signed in as ${req.user.role}.`,
        ),
      );
    }
    next();
  };
}
