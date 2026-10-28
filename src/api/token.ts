/**
 * Module-level access/refresh token holder, persisted to Web Storage — localStorage
 * when "Recordarme" is on (survives a browser restart), sessionStorage when off (ends
 * with the tab/browser). Kept separate from the React auth store so the api client can
 * read the bearer token without a circular import.
 *
 * It is also an OBSERVABLE store. That is not decoration: the token is mutated from
 * outside React on paths React cannot see — `authApi.login` writes it, and the api
 * client rotates it (or clears it, on a dead refresh chain) from inside `request`.
 * A component that merely READS `getAccessToken()` during render therefore sees a
 * stale value until something unrelated happens to re-render it. Mirroring the token
 * into component state does not fix that either — the mirror just drifts.
 *
 * So subscribers are notified on every write, and `AuthProvider` reads the token
 * through `useSyncExternalStore`. One source of truth, reactive by construction.
 */
const ACCESS_KEY = 'hold:accessToken'
const REFRESH_KEY = 'hold:refreshToken'

// Where the tokens live decides how long the session survives: 'local' persists across
// browser restarts (Recordarme ON), 'session' is wiped when the tab/browser closes
// (Recordarme OFF). The mode is chosen at login and kept for subsequent refreshes.
type StorageMode = 'local' | 'session'

function storageFor(mode: StorageMode): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return mode === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

// Boot: a token in sessionStorage means the last sign-in was NOT "remember me".
function detectMode(): StorageMode {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(ACCESS_KEY) !== null) {
      return 'session'
    }
  } catch {
    // ignore
  }
  return 'local'
}

function readStored(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    // A session token wins over a stale local one (a later Recordarme-off login).
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
    // Never leave a copy in the other storage (a mode switch or an earlier login).
    other?.removeItem(key)
  } catch {
    // ignore (private mode / disabled storage)
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
  // Set at login to choose persistence; omitted on a refresh so it keeps the login's choice.
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

/**
 * Subscribe to token writes. The returned function unsubscribes.
 * Shaped for `useSyncExternalStore`.
 */
export function subscribeToTokens(listener: TokenListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Snapshot for `useSyncExternalStore`: whether a session token is currently held.
 *
 * Returns a BOOLEAN on purpose. React re-reads the snapshot on every notification and
 * compares it by identity, so it must be a primitive that is stable when nothing
 * meaningful changed — returning the token string would work too, but a rotation
 * (same session, new string) would then re-render every consumer for no reason.
 */
export function hasAccessToken(): boolean {
  return accessToken !== null
}
