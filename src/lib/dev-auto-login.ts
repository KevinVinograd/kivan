/**
 * Dev-only auto-login policy. Session tokens live in `localStorage`
 * (`src/api/token.ts`), which is scoped per ORIGIN — and the port is part of the
 * origin. Every front served on a fresh port (each git worktree gets its own
 * auto-incremented one) therefore boots with no token and bounces to `/login`.
 * When explicitly opted in, the app performs one boot-time login with seeded
 * credentials so any port lands authenticated.
 *
 * The decision is a pure function so it can be unit-tested in the node `unit`
 * project; the `import.meta.env` / `navigator` lookups stay at the call site
 * (`src/lib/env.ts`).
 */

export interface DevAutoLoginConfig {
  readonly email: string
  readonly password: string
}

export interface DevAutoLoginSource {
  /** `import.meta.env.DEV`. Statically replaced at build, so prod strips this path. */
  readonly dev: boolean
  /** `VITE_DEV_AUTOLOGIN`. Only the exact string `'1'` opts in. */
  readonly flag: string | undefined
  readonly email: string | undefined
  readonly password: string | undefined
  /** `navigator.webdriver` — true under Playwright (the e2e run). */
  readonly automated: boolean
}

function trimmed(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const result = value.trim()
  return result === '' ? null : result
}

/**
 * Returns the credentials to boot-login with, or `null` to leave auth untouched.
 * Every condition must hold; a missing one means today's behavior, unchanged.
 */
export function resolveDevAutoLogin(source: DevAutoLoginSource): DevAutoLoginConfig | null {
  if (!source.dev) return null

  // Opt-in only. A dev server with no `.env.local` behaves exactly as it does today.
  if (trimmed(source.flag) !== '1') return null

  // Automation must never inherit a developer's `.env.local`: the e2e suite mocks the
  // API, and a real login would fight those stubs. An env-only guard is not enough —
  // `playwright.config.ts` sets `reuseExistingServer` locally, so Playwright often
  // attaches to a dev server it did not start (and whose env it cannot set). This
  // runtime check is what actually holds.
  if (source.automated) return null

  const email = trimmed(source.email)
  const password = trimmed(source.password)
  if (email === null || password === null) return null

  return { email, password }
}
