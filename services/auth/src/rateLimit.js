import rateLimit from 'express-rate-limit';

import { createRateLimitStore as store } from './redis.js';

/**
 * Login is the one endpoint worth guessing against, so it gets its own
 * budget: five attempts a minute per IP. Successful logins do not count, so a
 * legitimate user is never locked out by their own activity.
 */
export const loginLimiter = rateLimit({
  store: store('rl:login:'),
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

/**
 * Registration is limited to slow down bulk fake accounts, not to punish
 * someone fixing a form.
 *
 * skipFailedRequests matters here: without it, ten rejected submissions - a
 * short password, a roll number already taken - burn the whole hourly budget
 * and lock the person out of registering at all.
 *
 * The limit is deliberately generous because a campus sits behind one public
 * IP, so every student registering on results day shares this budget. If a
 * registration drive starts tripping it, raise it rather than leaving students
 * stuck.
 */
export const registerLimiter = rateLimit({
  store: store('rl:register:'),
  windowMs: 60 * 60_000,
  limit: 40,
  skipFailedRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many accounts created. Try again later.' },
  },
});
