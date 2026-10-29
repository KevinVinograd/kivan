import { resolveDevAutoLogin, type DevAutoLoginConfig } from './dev-auto-login'

interface FrontEnv {
  readonly apiUrl: string
  readonly devAutoLogin: DevAutoLoginConfig | null
}

function readApiUrl(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined
  const value = raw && raw.trim() !== '' ? raw : 'http://localhost:3010'
  return value.replace(/\/+$/, '')
}

function readDevAutoLogin(): DevAutoLoginConfig | null {
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
