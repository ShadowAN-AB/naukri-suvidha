import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { baseEnvSchema, loadEnvFile, parseEnv } from '@naukri-suvidha/service-kit';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadEnvFile(packageRoot);

export const paths = { packageRoot };

/**
 * The fourth extracted service, and the second to need the shared base to bend.
 *
 * `baseEnvSchema` was written when every service verified tokens on its own
 * HTTP surface - so it requires JWT secrets, a bcrypt work factor, access and
 * refresh TTLs. This one has no HTTP routes that take a token: it is called by
 * nothing from outside, triggered only by Kafka, and the one call it makes
 * carries a shared-secret header, not a JWT. The identity fields are not
 * useful here, so they are omitted rather than filled with placeholders a
 * reader would mistake for configuration.
 *
 * Same shape as realtime's `.omit({ MONGODB_URI: true })` for its no-db case:
 * the schema says what the service actually needs, not what the shared base
 * assumed every service would need.
 *
 * MONGODB_URI stays required: this service writes an `EmailLog` row per send,
 * and the unique index on `eventKey` is what makes a Kafka redelivery a
 * no-op rather than a second send.
 */
const schema = baseEnvSchema
  .omit({
    JWT_ACCESS_SECRET: true,
    JWT_REFRESH_SECRET: true,
    ACCESS_TOKEN_TTL: true,
    REFRESH_TOKEN_TTL: true,
    BCRYPT_ROUNDS: true,
  })
  .extend({
    PORT: z.coerce.number().int().positive().default(5005),

    /**
     * Where the events come from. Optional only so this service can be started
     * and its routes exercised without a broker - the same pattern as
     * notifications. The warning at boot is loud, because this is the one way
     * this service can look completely healthy while sending nothing at all.
     */
    KAFKA_BROKERS: z.string().optional(),
    KAFKA_CLIENT_ID: z.string().default('naukri-suvidha-email'),

    /**
     * The auth service, for `getUserEmail`.
     *
     * Student emails live in naukri_suvidha_auth.users and nowhere else, so
     * this service has to ask auth for the address every event names. The
     * crossing is modelled on `realtime -> auth /internal/introspect`: same
     * shared-secret header, same bearer transport. Optional so a development
     * run without an auth service can still boot - the handler then logs a
     * `skipped` row rather than failing, which is better behaviour on a
     * laptop than falling over.
     */
    AUTH_SERVICE_URL: z.string().url().optional(),
    AUTH_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
    AUTH_GATEWAY_SECRET: z.string().min(16).optional(),

    /**
     * SMTP transport. Required at boot - without it there is nothing to send
     * through, and silent failure is worse than loud refusal.
     */
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().min(1),
    SMTP_PASS: z.string().min(1),
    MAIL_FROM: z.string().min(1),

    /**
     * Demo-only: every send is rewritten to this address, so a demo laptop
     * can show the email arriving without needing real inboxes for seeded
     * students (whose @naukrisuvidha.edu addresses are not real). The
     * EmailLog row still records the seeded `to` as `originalTo`, so the
     * rewrite is visible rather than silent.
     */
    DEMO_EMAIL_OVERRIDE: z.string().email().optional(),
  });

export const env = parseEnv(schema, {
  hint: 'Copy services/email/.env.example to services/email/.env and fill it in.',
});
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
