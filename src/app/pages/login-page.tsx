import { Navigate } from 'react-router'

import { useAuth } from '@/app/lib/auth-store'
import { AuthSplitLayout } from './auth-split-layout'
import { LoginFields } from './login-fields'

export function LoginPage() {
  const { isAuthenticated } = useAuth()

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <AuthSplitLayout title="Iniciá sesión" subtitle="Ingresá con tu cuenta.">
      <LoginFields />
    </AuthSplitLayout>
  )
}
