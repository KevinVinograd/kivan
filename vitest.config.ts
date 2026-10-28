import path from 'node:path'

import { defineConfig } from 'vitest/config'

/**
 * Unit tests for pure logic (`src/**\/*.test.ts`) in a node environment. The Playwright
 * end-to-end suite lives apart, in `playwright.config.ts`.
 */
export default defineConfig({
  test: {
    projects: [
      {
        // Mirror the app's aliases (vite.config.ts) so tests import the same modules the app does.
        resolve: {
          alias: {
            '@': path.resolve(__dirname, './src'),
            '@hold/shared': path.resolve(__dirname, './packages/shared/src/index.ts'),
          },
        },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          // The timezone the product is used in: in UTC, local-vs-UTC date bugs pass unseen.
          env: { TZ: 'America/Argentina/Buenos_Aires' },
        },
      },
    ],
  },
})
