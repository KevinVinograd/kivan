import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the role-driven heuristic walkthrough (`e2e/`).
 *
 * The harness drives the running app from each role's point of view; see
 * `ai/methodologies/role-heuristic-walkthrough.md`. `webServer` boots the Vite
 * dev server (pinned to PORT) and waits for it. PORT defaults to 5173 (free on a
 * clean machine and in CI); set `E2E_PORT` to target a free port when another
 * checkout already holds 5173 locally.
 *
 * The server is started with `pnpm exec vite`, NOT `pnpm run dev -- …`. The `-- …`
 * form silently drops the flags: vite never sees `--port` or `--strictPort`, falls
 * back to 5173, and auto-increments away when that is taken. Playwright then waits
 * on a port nothing ever bound and dies with "Timed out waiting 120000ms from
 * config.webServer". It went unnoticed because CI leaves `E2E_PORT` unset, so the
 * ignored `--port 5173` happened to match vite's own default.
 */
const PORT = Number(process.env.E2E_PORT ?? 5173)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // Vite dev compiles routes on demand, so a single serial worker against one dev
  // server keeps navigations reliable (parallel cold hits overwhelm the server).
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // The e2e suite mocks the API, so a real boot-time login would fight its stubs.
    // This only covers the server Playwright starts itself — with `reuseExistingServer`
    // it often attaches to a dev server it did not spawn, whose env it cannot set. The
    // guard that actually holds is the `navigator.webdriver` check in
    // `src/lib/dev-auto-login.ts`; this is defense in depth.
    env: { VITE_DEV_AUTOLOGIN: '0' },
  },
})
