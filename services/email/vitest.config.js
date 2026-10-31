import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // A real mongod is required (same guard as the other services), so parallel
    // runs would race the collection drops between tests.
    fileParallelism: false,
    include: ['test/**/*.test.js'],
    globalSetup: ['./test/global-setup.js'],
    setupFiles: ['./test/setup.js'],
  },
});
