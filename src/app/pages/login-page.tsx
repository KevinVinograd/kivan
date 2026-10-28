import { Navigate } from 'react-router'

import { useAuth } from '@/app/lib/auth-store'
import { AuthSplitLayout } from './auth-split-layout'
import { LoginFields } from './login-fields'

/**
 * Iniciar sesión — the pre-auth surface (route `/login`), rendered outside the
 * AppShell (no nav, no role rail) and the only page reachable while unauthenticated;
 * `RequireAuth` redirects here when there is no session, and an already signed-in
 * visitor is bounced to `/dashboard`.
 *
 * The split shell (branded shader panel + solid form panel) lives in
 * `AuthSplitLayout`, shared with the forgot-password surface; this page owns only the
 * title, subtitle and the sign-in form.
 */
export function LoginPage() {
  const { isAuthenticated } = useAuth()

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <AuthSplitLayout title="Iniciá sesión" subtitle="Ingresá con tu cuenta.">
      <LoginFields />
    </AuthSplitLayout>
  )
}
