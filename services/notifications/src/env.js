import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { baseEnvSchema, loadEnvFile, parseEnv } from '@naukri-suvidha/service-kit';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadEnvFile(packageRoot);

export const paths = { packageRoot };

/**
 * This service is a pure consumer with an inbox, and its configuration says
 * so: a database, a broker to listen to, and a Redis to push through.
 *
 * The difference from the auth service is worth naming, because it is the
 * lesson of extracting an event-driven service rather than a request-driven
 * one. auth needed nothing but mongo - a caller reaches it over HTTP, and
 * without the caller it is simply idle. This one has no caller. Everything it
 * does begins with an event, so **the broker is not optional here the way it
 * is for the API**. Without KAFKA_BROKERS this service answers its inbox
 * routes and receives nothing, and it says so loudly at boot rather than
 * looking healthy and quietly doing nothing.
 */
const schema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(5003),

  /*
   * Its own database, `naukri_suvidha_notifications`. The API has no
   * connection that can read the inbox, and this service has none that can
   * read applications, jobs or students - which is why the events it consumes
   * had to start carrying the audience with them.
   */

  /**
   * Where the events come from. Optional only so this service can be started
   * and its routes exercised without a broker; see the warning in server.js.
   */
  KAFKA_BROKERS: z.string().optional(),
  KAFKA_CLIENT_ID: z.string().default('naukri-suvidha-notifications'),

  IDENTITY_MODE: z.enum(['bearer', 'gateway']).default('bearer'),
  AUTH_GATEWAY_SECRET: z.string().min(16).optional(),
}).superRefine((value, ctx) => {
  if (value.IDENTITY_MODE === 'gateway' && !value.AUTH_GATEWAY_SECRET) {
    ctx.addIssue({
      code: 'custom',
      path: ['AUTH_GATEWAY_SECRET'],
      message: 'is required when IDENTITY_MODE=gateway, or any caller could forge an identity',
    });
  }
});

export const env = parseEnv(schema, {
  hint: 'Copy services/notifications/.env.example to services/notifications/.env and fill it in.',
});
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
