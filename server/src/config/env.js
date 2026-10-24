import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Resolve .env against the server package, not the shell's cwd, so the
// process behaves the same whether it is started from the repo root, from
// server/, or by a process manager.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Which file to read. Tests get their own, and never fall back to .env:
// the suite wipes every collection between tests, so pointing it at a
// developer's real database destroys their data. It did exactly that once.
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';

// override: a local env file wins over whatever is already in the environment.
// Without this, a PORT exported by a parent process - a dev runner starting
// the client and the server together, or a shell that happens to have PORT
// set - silently steals the port. In production there is no env file, so the
// platform's own PORT is still the one that applies.
dotenv.config({ path: path.join(packageRoot, envFile), override: true });

export const paths = { packageRoot };

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // Optional. Set it and the cache, the rate limiter and the socket gateway
  // all become shared between replicas; leave it unset and each process keeps
  // its own, which is correct for one instance and wrong for two.
  REDIS_URL: z.string().url().optional(),

  // Optional. Comma-separated list, e.g. "kafka:9092". Set it and domain
  // events travel through a broker and survive the process; leave it unset
  // and they are delivered in-process, which is lost on restart.
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
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
