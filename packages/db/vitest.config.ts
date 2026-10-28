import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The DB test spins up a single Postgres container; run serially in one fork
    // so concurrent runs don't contend for Docker.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
