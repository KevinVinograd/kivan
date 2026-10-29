const ACCESS_KEY = 'hold:accessToken'
const REFRESH_KEY = 'hold:refreshToken'

type StorageMode = 'local' | 'session'

function storageFor(mode: StorageMode): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return mode === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

function detectMode(): StorageMode {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(ACCESS_KEY) !== null) {
      return 'session'
    }
  } catch {
  }
  return 'local'
}

function readStored(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key)
  } catch {
    return null
  }
}

let mode: StorageMode = detectMode()
let accessToken: string | null = readStored(ACCESS_KEY)
let refreshToken: string | null = readStored(REFRESH_KEY)

type TokenListener = () => void
const listeners = new Set<TokenListener>()

function persist(key: string, value: string | null): void {
  if (typeof window === 'undefined') return
  const primary = storageFor(mode)
  const other = storageFor(mode === 'local' ? 'session' : 'local')
  try {
    if (value === null) primary?.removeItem(key)
    else primary?.setItem(key, value)
    other?.removeItem(key)
  } catch {
  }
}

export function getAccessToken(): string | null {
  return accessToken
}

export function getRefreshToken(): string | null {
  return refreshToken
}

export function setTokens(
  access: string | null,
  refresh: string | null,
  remember?: boolean,
): void {
  if (remember !== undefined) mode = remember ? 'local' : 'session'
  accessToken = access
  refreshToken = refresh
  persist(ACCESS_KEY, access)
  persist(REFRESH_KEY, refresh)
  for (const listener of listeners) listener()
}

export function clearTokens(): void {
  setTokens(null, null)
}

export function subscribeToTokens(listener: TokenListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function hasAccessToken(): boolean {
  return accessToken !== null
}
