import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useRole } from '@/app/lib/use-role'
import { canAccessPath } from '@/app/lib/role-access'

/**
 * Route guard for role-restricted pages. Renders its children only when the
 * active role may access `path` (per `PAGE_ACCESS` in role-access.ts); otherwise
 * it redirects to `/dashboard`, every role's landing route. Pairs with the
 * SideNav filtering in App so an owner/admin-only page is both hidden from the
 * rail and unreachable by URL for other roles.
 */
export function RoleGate({ path, children }: { path: string; children: ReactNode }) {
  const { role, permissions } = useRole()
  if (!canAccessPath(role, path, permissions)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
