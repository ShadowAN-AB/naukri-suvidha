import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Environment loading, shared by every service rather than copied into each.
 *
 * The copying is the risk this exists to remove. Both rules below were learnt
 * the hard way in the monolith, and a second service that reimplemented them
 * slightly differently would relearn them the same way - except the second
 * time there would be two places to fix and only one of them obviously wrong.
 */

/**
 * Read the service's own env file.
 *
 * `packageRoot`, not the shell's cwd, so a process behaves the same whether it
 * is started from the repo root, from its own directory, or by a process
 * manager.
 *
 * Tests get their own file and never fall back to `.env`: a suite wipes every
 * collection between tests, so pointing it at a developer's real database
 * destroys their data. It did exactly that once, which is why the file is
 * chosen here rather than left to whichever `.env` happens to be found.
 *
 * `override: true` so a local env file beats whatever is already in the
 * environment. Without it a PORT exported by a parent - a dev runner starting
 * several processes at once, or a shell that happens to have PORT set -
 * silently steals the port. In production there is no env file, so the
 * platform's own variables are still the ones that apply.
 */
export function loadEnvFile(packageRoot) {
  const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
  dotenv.config({ path: path.join(packageRoot, envFile), override: true });
  return { packageRoot, envFile };
}

/**
 * The variables every service in this system reads.
 *
 * The JWT fields are the important ones: an access token minted by the auth
 * service is verified by the API, so the two processes must agree on the
 * secrets and on how the token is shaped. Defining them once here is what
 * keeps "the same token" from meaning two different things.
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // Optional. Set it and the cache and the rate-limit counters become shared
  // between replicas; leave it unset and each process keeps its own, which is
  // correct for one instance and wrong for two.
  REDIS_URL: z.string().url().optional(),
});

/**
 * Parse `process.env` and fail loudly rather than start half-configured.
 *
 * A service that boots with a missing secret does not fail here - it fails
 * later, on the first request that needed it, in a stack trace that names the
 * library rather than the variable.
 */
export function parseEnv(schema, { hint = 'Copy .env.example to .env and fill it in.' } = {}) {
  const parsed = schema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Invalid environment configuration:\n${issues}\n\n${hint}`);
  process.exit(1);
}
