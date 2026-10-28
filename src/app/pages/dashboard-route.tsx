import { useRole } from '@/app/lib/use-role'
import { OwnerDashboardPage } from './owner-dashboard-page'
import { AdminOperationsDashboardPage } from './admin-dashboard-page'
import { EmployeeDashboardPage } from './employee-dashboard-page'

/**
 * Resolves the `/dashboard` route to the active role's variant. All three role
 * dashboards are built: owner (the cockpit), admin/operación (the monthly-close
 * control center) and employee (the personal work view). This is the seam future
 * role-aware perspectives plug into — add a variant here, not a new route or nav
 * item.
 */
export function DashboardRoute() {
  const { role } = useRole()
  if (role === 'owner') return <OwnerDashboardPage />
  if (role === 'admin') return <AdminOperationsDashboardPage />
  return <EmployeeDashboardPage />
}
