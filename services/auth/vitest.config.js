import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // A real mongod on a throwaway database, as in the API's suite: the unique
    // indexes on email and tokenHash are precisely what the rotation and
    // replay tests rely on, and a fake would not have them.
    //
    // The database is a *different* one from the API's, which is the boundary
    // this service exists to draw - so the two suites can run at once.
    env: { NODE_ENV: 'test' },
    setupFiles: ['./test/setup.js'],
    globalSetup: './test/global-setup.js',
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
