import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { baseEnvSchema, loadEnvFile, parseEnv } from '@naukri-suvidha/service-kit';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadEnvFile(packageRoot);

export const paths = { packageRoot };

/**
 * The first service with **no database at all**, and that is correct rather
 * than an omission.
 *
 * Database-per-service means one database per deployable that *owns data*.
 * This one owns none: it holds live connections, which are state in memory by
 * definition and cannot be persisted anywhere useful. Giving it a database to
 * satisfy the pattern would be the paperwork without the benefit - the same
 * argument this project already made against database-per-*module*.
 *
 * What it does need is Redis, and the dependency is sharper here than
 * anywhere else in the system. This service holds every socket; the API and
 * the notifications service hold none and publish through the Redis adapter's
 * channel. So **without Redis a push from another process cannot arrive at
 * all** - not degraded, absent. That is the same lesson the notifications
 * extraction taught about Kafka, one layer out: extracting a component makes
 * the transport underneath it load-bearing.
 *
 * It is still optional in the schema, because a single-process development
 * run has no other process to hear from, and `/health` says which it is.
 */
/*
 * `MONGODB_URI` is *omitted*, not left blank, and this is the first place the
 * shared base schema has had to bend.
 *
 * `baseEnvSchema` requires a database URI, because every service written
 * before this one owned data and the requirement was free. This one owns
 * none, so the honest options were a fake URI nobody connects with - which
 * would be a lie that boots - or saying so in the schema. Omitting it means a
 * missing database is impossible to misconfigure here rather than merely
 * unused, and `.env.example` has no line for someone to helpfully fill in.
 */
const schema = baseEnvSchema.omit({ MONGODB_URI: true }).extend({
  PORT: z.coerce.number().int().positive().default(5004),

  /**
   * Where to introspect a handshake's token.
   *
   * A Socket.IO handshake carries its token in the connection payload rather
   * than an Authorization header, and the edge proxies `/socket.io` straight
   * through - there is no `auth_request` on a websocket upgrade. So this is
   * the one entry point in the system the gateway cannot cover, and it asks
   * the auth service directly to get the answer the edge would have got.
   *
   * Unset means bearer mode: verify the signature here and trust the claims,
   * which is all a development run can do.
   */
  AUTH_SERVICE_URL: z.string().url().optional(),
  AUTH_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  AUTH_GATEWAY_SECRET: z.string().min(16).optional(),
});

export const env = parseEnv(schema, {
  hint: 'Copy services/realtime/.env.example to services/realtime/.env and fill it in.',
});
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
