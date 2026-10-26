import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { baseEnvSchema, loadEnvFile, parseEnv } from '@naukri-suvidha/service-kit';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadEnvFile(packageRoot);

export const paths = { packageRoot };

/**
 * This service reads far less than the API does, which is the first visible
 * dividend of the extraction: no storage provider, no model, no broker, no
 * vector index. Authentication needs a database, two secrets and a bcrypt
 * cost.
 */
const schema = baseEnvSchema.extend({
  // 5002, so it can run beside the API's 5001 on a laptop.
  PORT: z.coerce.number().int().positive().default(5002),

  /*
   * Its own database, not its own collections in the API's.
   *
   * MONGODB_URI comes from the base schema and points at
   * `naukri_suvidha_auth`. The API cannot read `users` from there even by
   * accident, which is the difference between ownership that is enforced and
   * ownership that is a convention somebody has to remember. A shared
   * database would have been less work and is the textbook way to end up with
   * two services that cannot be deployed separately.
   */

  /**
   * The API, for the one call that crosses the boundary in this direction:
   * registration creates the role profile, and Students and Companies belong
   * to the API. See profiles.js for what happens when this call fails.
   *
   * Optional so this service can be started and exercised alone - with it
   * unset, registration has nowhere to put a profile and says so rather than
   * writing half an account.
   */
  API_INTERNAL_URL: z.string().url().optional(),
  API_INTERNAL_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),

  /**
   * The shared secret on every internal call, in both directions: this
   * service presents it to the API, and requires it from the edge on
   * /internal/*. Without it the introspection endpoint would let anyone who
   * can reach this process turn a token into an identity, and the API's
   * /internal/profiles would let anyone create an account.
   */
  AUTH_GATEWAY_SECRET: z.string().min(16, 'AUTH_GATEWAY_SECRET must be at least 16 characters'),
});

export const env = parseEnv(schema, {
  hint: 'Copy services/auth/.env.example to services/auth/.env and fill it in.',
});
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
