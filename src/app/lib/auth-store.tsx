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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me })
    },
  })

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
    void authApi.logout().catch(() => {})
    clearTokens()
    queryClient.setQueryData<Me | null>(queryKeys.auth.me, null)
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
