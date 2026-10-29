export interface DevAutoLoginConfig {
  readonly email: string
  readonly password: string
}

export interface DevAutoLoginSource {
  readonly dev: boolean
  readonly flag: string | undefined
  readonly email: string | undefined
  readonly password: string | undefined
  readonly automated: boolean
}

function trimmed(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const result = value.trim()
  return result === '' ? null : result
}

export function resolveDevAutoLogin(source: DevAutoLoginSource): DevAutoLoginConfig | null {
  if (!source.dev) return null

  if (trimmed(source.flag) !== '1') return null

  if (source.automated) return null

  const email = trimmed(source.email)
  const password = trimmed(source.password)
  if (email === null || password === null) return null

  return { email, password }
}
