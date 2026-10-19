import rateLimit from 'express-rate-limit';

/**
 * Login is the one endpoint worth guessing against, so it gets its own
 * budget: five attempts a minute per IP. Successful logins do not count, so a
 * legitimate user is never locked out by their own activity.
 */
export const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Too many sign-in attempts. Wait a minute and try again.',
    },
  },
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many accounts created. Try again later.' },
  },
});
