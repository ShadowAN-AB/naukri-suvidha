import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { baseEnvSchema, loadEnvFile, parseEnv } from '@naukri-suvidha/service-kit';

// Resolve .env against the server package, not the shell's cwd, so the
// process behaves the same whether it is started from the repo root, from
// server/, or by a process manager.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The dotenv rules - which file, and that it overrides the ambient
// environment - live in service-kit, because both this service and the auth
// service depend on them and the `.env.test` guard is the thing that stops a
// test run from dropping a developer's database.
loadEnvFile(packageRoot);

export const paths = { packageRoot };

/**
 * The base schema holds what every service reads: the JWT configuration, the
 * mongo URI, logging, Redis. Everything below it is this service's own.
 */
const schema = baseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(5001),

  /**
   * Where identity comes from, and the reason this service no longer owns the
   * users collection.
   *
   * `bearer`  - verify the access token here, from its signature, and trust
   *             its claims. No database lookup, because the users collection
   *             belongs to the auth service now. This is what `npm run dev`
   *             and the test suite use: one process, no gateway, nothing else
   *             to start. The cost is exact and worth stating - there is no
   *             revocation check, so a suspended account keeps access until
   *             its access token expires, which is ACCESS_TOKEN_TTL.
   *
   * `gateway` - the edge has already authenticated the request and forwarded
   *             the identity, so this service reads it from the headers and
   *             verifies nothing. The revocation check is not skipped here,
   *             it is *moved*: the auth service does it, against its own
   *             database, once per request at the edge. Compose and
   *             Kubernetes both run this mode.
   *
   * The default is `bearer` for the same reason REDIS_URL and KAFKA_BROKERS
   * are optional: a developer with mongo running should be able to start this
   * and have it work.
   */
  IDENTITY_MODE: z.enum(['bearer', 'gateway']).default('bearer'),

  /**
   * The shared secret the edge presents with a forwarded identity. Required
   * in gateway mode - see the refinement below, which is what stops a
   * misconfigured deployment from accepting any identity any caller claims.
   */
  AUTH_GATEWAY_SECRET: z.string().min(16).optional(),

  /**
   * The auth service, for the two calls that cross the boundary in this
   * direction: the socket handshake (which does not pass through the edge's
   * authentication, so it introspects here) and the admin user count.
   *
   * Optional, and both callers degrade rather than fail when it is unset -
   * which is what keeps a single-process `npm run dev` working.
   */
  AUTH_SERVICE_URL: z.string().url().optional(),
  AUTH_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),

  KAFKA_BROKERS: z.string().optional(),
  KAFKA_CLIENT_ID: z.string().default('naukri-suvidha-api'),

  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),

  // Only read when STORAGE_PROVIDER=s3. Works with any S3-compatible service:
  // set S3_ENDPOINT for Cloudflare R2, Backblaze B2 or MinIO.
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  LLM_PROVIDER: z.enum(['ollama', 'claude']).default('ollama'),
  OLLAMA_BASE_URL: z.string().url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().default('llama3.1:8b'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),
  AI_CONCURRENCY: z.coerce.number().int().positive().default(2),

  // Semantic search. The embedding model is separate from the generation
  // model: vectors from different models are not comparable, so changing this
  // invalidates every stored vector.
  EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
  // memory = linear scan in process (works on a standalone mongod)
  // atlas  = $vectorSearch (needs a search index defined on Atlas)
  VECTOR_INDEX: z.enum(['memory', 'atlas']).default('memory'),
  AI_TASK_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
}).superRefine((value, ctx) => {
  /*
   * Gateway mode without a secret would accept whatever identity a caller
   * put in a header, which is a complete authentication bypass and would
   * start without complaint. It is caught here rather than at the first
   * request because an authorization hole that only shows up under traffic
   * is one that reaches production.
   */
  if (value.IDENTITY_MODE === 'gateway' && !value.AUTH_GATEWAY_SECRET) {
    ctx.addIssue({
      code: 'custom',
      path: ['AUTH_GATEWAY_SECRET'],
      message: 'is required when IDENTITY_MODE=gateway, or any caller could forge an identity',
    });
  }
});

export const env = parseEnv(schema);
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
