import { type ReactNode } from 'react'
import { Navigate } from 'react-router'

import { useAuth } from './lib/auth-store'

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
