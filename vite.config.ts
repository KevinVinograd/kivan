import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  cacheDir: path.resolve(__dirname, '.vite'),
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@hold/shared': path.resolve(__dirname, './packages/shared/src/index.ts'),
    },
  },

  assetsInclude: ['**/*.svg', '**/*.csv'],
})
