import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
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
          env: { TZ: 'America/Argentina/Buenos_Aires' },
        },
      },
    ],
  },
})
