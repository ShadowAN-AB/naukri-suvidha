import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // The suite talks to a real mongod on a throwaway database rather than an
    // in-memory stand-in: the unique indexes and the aggregation pipelines are
    // exactly what we need to be sure about, and a fake would not have them.
    // Also set here: a worker process does not inherit what globalSetup put
    // on process.env, and env.js reads NODE_ENV at import time.
    env: { NODE_ENV: 'test' },
    setupFiles: ['./test/setup.js'],
    globalSetup: './test/global-setup.js',
    // Mongoose connections and one shared database make parallel files unsafe.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
