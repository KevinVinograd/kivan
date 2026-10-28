import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Per-CHECKOUT dep-optimize cache, deliberately NOT the default `node_modules/.vite`.
  //
  // Worktrees under this repo get their node_modules as a JUNCTION to the main
  // checkout's (dev-workflow.md § 13 — pnpm cannot install into a nested worktree and
  // the registry is blocked). That junction also shares `node_modules/.vite`, so two
  // Vite dev servers — main checkout + a worktree, or the app + the sandbox — end up
  // owning ONE optimize-deps cache. Each rewrites `deps/` and bumps `browserHash` on
  // startup, so a server that already handed the browser `react-query?v=A` (importing
  // React chunk `?v=A`) then serves the app's React as `?v=B`. Two React copies in one
  // page: the second one's dispatcher is null, `useEffect` throws "Cannot read
  // properties of null", and the app never mounts — a blank page with no <main>.
  //
  // That is not hypothetical: it took the whole e2e suite from 104 passing to 0, since
  // every spec starts with `expect(page.locator('main')).toBeVisible()`.
  //
  // Anchoring the cache to the checkout root (which IS distinct per worktree, unlike
  // node_modules) gives every server its own. `.vite/` is gitignored.
  cacheDir: path.resolve(__dirname, '.vite'),
  plugins: [
    // React and Tailwind plugins are both required — do not remove them.
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
      // Resolve the shared workspace package to its SOURCE (not its built dist), so the
      // web app can import the canonical Zod enums as runtime values without a prior
      // `@hold/shared` build. Vite transpiles the TS source the same way it does src/.
      '@hold/shared': path.resolve(__dirname, './packages/shared/src/index.ts'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
