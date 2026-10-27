import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // A real mongod on a throwaway database, as in the other two suites, and a
    // third database so all three can run at once.
    env: { NODE_ENV: 'test' },
    setupFiles: ['./test/setup.js'],
    globalSetup: './test/global-setup.js',
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
