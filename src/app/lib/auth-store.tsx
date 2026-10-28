/**
 * Auth store — the real session. Resolves the signed-in user from the API (when
 * a token is present), exposes login/logout, and is the source of truth for the
 * session role (replacing the dev-only role switch once login is wired into the
 * UI). Provider-level infra; no design-system surface.
 *
 * It also owns the opt-in dev auto-login bootstrap (`src/lib/dev-auto-login.ts`),
 * which logs in once per page load so a front served on a fresh port does not force
 * a fresh login. Production builds strip that path entirely.
 *
 * This file is deliberately thin: every session DECISION lives in the pure state
 * machine at `./auth-session.ts`, which CI can test directly. What stays here is
 * the react-query wiring and the effect that runs the one-shot boot login.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, type Me } from '@/api/auth'
import { clearTokens, hasAccessToken, subscribeToTokens } from '@/api/token'
import { env } from '@/lib/env'
import { queryKeys } from '@/queries/keys'
import { deriveAuthSession, deriveMeStatus, type BootstrapStatus } from './auth-session'

interface AuthValue {
  me: Me | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string, remember?: boolean) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // SUBSCRIBE to the token; never read it during render. Every write happens outside
  // React — `authApi.login` on sign-in, and the api client rotating or clearing the pair
  // on a 401 — so a render-time `getAccessToken()` only sees the new value when something
  // unrelated re-renders this provider. The login FORM supplied that by accident (it
  // navigates on success), which hid the bug until a caller logged in WITHOUT navigating:
  // `/auth/me` then stayed disabled forever and the app hung on the RequireAuth splash.
  // Mirroring the token into `useState` is not a fix either — the api client's own writes
  // bypass the mirror and it drifts. One observable source of truth instead.
  const hasToken = useSyncExternalStore(subscribeToTokens, hasAccessToken, hasAccessToken)
  const [hadTokenAtMount] = useState(hasAccessToken)

  const meQuery = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => authApi.me(),
    enabled: hasToken,
    retry: false,
  })

  const loginMutation = useMutation({
    mutationFn: ({
      email,
      password,
      remember,
    }: {
      email: string
      password: string
      remember?: boolean
    }) => authApi.login(email, password, remember),
    // No token bookkeeping here: `authApi.login` already wrote it to the store, which
    // notified `useSyncExternalStore` above.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me })
    },
  })

  // `import.meta.env.DEV` is redundant for CORRECTNESS — `devAutoLogin` is already null
  // in a prod build. It is here for DEAD-CODE ELIMINATION: the bundler replaces it with
  // a literal `false`, which lets it drop the bootstrap body (the login call, the
  // credential plumbing, the warning string) from the production bundle rather than
  // ship it inert. Verified by grepping `dist/`; see the PR that introduced it.
  const [bootstrapConfigured] = useState(() => import.meta.env.DEV && env.devAutoLogin !== null)
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>('idle')
  const hasStartedBootstrap = useRef(false)
  const { mutateAsync: runLogin } = loginMutation

  const session = deriveAuthSession({
    bootstrapConfigured,
    hadTokenAtMount,
    hasSessionUser: meQuery.data != null,
    meStatus: deriveMeStatus({
      hasToken,
      isSuccess: meQuery.isSuccess,
      isError: meQuery.isError,
    }),
    meIsFetching: meQuery.isFetching,
    bootstrapStatus,
  })

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const config = env.devAutoLogin
    if (!session.shouldStartBootstrap || config === null) return
    // StrictMode double-invokes effects in dev, and `setBootstrapStatus` has not landed
    // yet on the second pass — so the ref, not the status, is what makes this one-shot.
    // Without it the bootstrap POSTs /auth/login twice and burns a second single-use
    // refresh-token chain.
    if (hasStartedBootstrap.current) return
    hasStartedBootstrap.current = true
    setBootstrapStatus('running')

    void runLogin({ email: config.email, password: config.password })
      .then(() => setBootstrapStatus('succeeded'))
      .catch((error: unknown) => {
        console.warn('[dev-auto-login] boot login failed; falling back to the login page', error)
        setBootstrapStatus('failed')
      })
  }, [session.shouldStartBootstrap, runLogin])

  // Token death that is NOT a user-driven logout: the api client clears the pair when a
  // rotating refresh fails (client.ts). That only DISABLES the me-query (`enabled: hasToken`)
  // — its cached user lingers, so `isAuthenticated` stays true and the shell keeps rendering a
  // signed-in app over data it can no longer refresh. Evict it on the true→false transition,
  // mirroring logout()'s local clear (minus the server revoke / navigate the failure path can't
  // do). Guarded by a ref so it never fires pre-login (hasToken starts false with no session).
  const sessionWasLive = useRef(false)
  useEffect(() => {
    if (hasToken) {
      sessionWasLive.current = true
      return
    }
    if (!sessionWasLive.current) return
    sessionWasLive.current = false
    queryClient.setQueryData<Me | null>(queryKeys.auth.me, null)
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' })
  }, [hasToken, queryClient])

  const login = useCallback(
    async (email: string, password: string, remember?: boolean) => {
      await loginMutation.mutateAsync({ email, password, remember })
    },
    [loginMutation],
  )

  const logout = useCallback(() => {
    // Revoke the refresh token server-side so it can't be rotated after sign-out. Best-effort
    // and fire-and-forget (the api wrapper reads the token itself): the local clear below
    // happens regardless, so a network error still logs you out here. Fire BEFORE clearing.
    void authApi.logout().catch(() => {})
    // Clearing the store notifies the subscription above, so `hasToken` flips on its own.
    clearTokens()
    // Set the session user to null on the SAME query the mounted observer reads,
    // so `isAuthenticated` flips to false synchronously — before logout's navigate
    // runs. Do NOT `clear()` first: clear() destroys the `me` query and detaches
    // the observer, which then keeps serving the stale user until it re-subscribes
    // next render — long enough for LoginPage's authenticated-guard to bounce
    // /login back to /dashboard (the logout-stays-on-dashboard bug).
    queryClient.setQueryData<Me | null>(queryKeys.auth.me, null)
    // Drop the rest of the workspace cache (everything except the auth query we
    // just reset) so a subsequent session never inherits stale data.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' })
  }, [queryClient])

  const value = useMemo<AuthValue>(
    () => ({
      me: meQuery.data ?? null,
      isAuthenticated: meQuery.data != null,
      isLoading: session.isLoading,
      login,
      logout,
    }),
    [meQuery.data, session.isLoading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
