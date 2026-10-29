import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useRole } from '@/app/lib/use-role'
import { canAccessPath } from '@/app/lib/role-access'

export function RoleGate({ path, children }: { path: string; children: ReactNode }) {
  const { role, permissions } = useRole()
  if (!canAccessPath(role, path, permissions)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
