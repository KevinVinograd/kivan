import { type ReactNode } from 'react'
import { Navigate } from 'react-router'

import { useAuth } from './lib/auth-store'

/**
 * Route guard for the authenticated app. Renders its children only for a resolved
 * session; shows a minimal splash while `/auth/me` is still resolving (e.g. a
 * reload with a stored token) and redirects to `/login` when there is no session.
 * Wraps the layout route so every authenticated surface sits behind it; `/login`
 * is the sibling public route.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <span className="type-body-2 fg-subtle">Cargando tu sesión…</span>
      </main>
    )
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />

  return <>{children}</>
}
