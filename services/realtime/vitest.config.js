import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // One file, and sockets bind a real port - so no parallelism to fight over
    // it. Same reason the other services' suites run serially.
    fileParallelism: false,
    include: ['test/**/*.test.js'],
  },
});
