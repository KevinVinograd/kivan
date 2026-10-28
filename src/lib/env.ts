/**
 * Validated access to the Vite env. `VITE_API_URL` points the front at the
 * backend; defaults to the local API so dev works out of the box.
 */
import { resolveDevAutoLogin, type DevAutoLoginConfig } from './dev-auto-login'

interface FrontEnv {
  readonly apiUrl: string
  /**
   * Seeded credentials to log in with on boot, or `null` to leave auth alone.
   * Non-null ONLY in a dev build that explicitly opted in via `.env.local` — see
   * `dev-auto-login.ts` for why (per-origin `localStorage` vs. per-worktree ports).
   */
  readonly devAutoLogin: DevAutoLoginConfig | null
}

function readApiUrl(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined
  const value = raw && raw.trim() !== '' ? raw : 'http://localhost:3010'
  return value.replace(/\/+$/, '')
}

function readDevAutoLogin(): DevAutoLoginConfig | null {
  // `import.meta.env.DEV` is statically replaced at build time, so in a production
  // bundle this collapses to `return null` and the whole auto-login path — resolver,
  // credential lookups and all — is dead-code-eliminated rather than merely disabled.
  if (!import.meta.env.DEV) return null

  return resolveDevAutoLogin({
    dev: true,
    flag: import.meta.env.VITE_DEV_AUTOLOGIN as string | undefined,
    email: import.meta.env.VITE_DEV_AUTOLOGIN_EMAIL as string | undefined,
    password: import.meta.env.VITE_DEV_AUTOLOGIN_PASSWORD as string | undefined,
    automated: typeof navigator !== 'undefined' && navigator.webdriver === true,
  })
}

export const env: FrontEnv = {
  apiUrl: readApiUrl(),
  devAutoLogin: readDevAutoLogin(),
}
