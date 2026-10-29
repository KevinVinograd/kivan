import { useRole } from '@/app/lib/use-role'
import { OwnerDashboardPage } from './owner-dashboard-page'
import { AdminOperationsDashboardPage } from './admin-dashboard-page'
import { EmployeeDashboardPage } from './employee-dashboard-page'

export function DashboardRoute() {
  const { role } = useRole()
  if (role === 'owner') return <OwnerDashboardPage />
  if (role === 'admin') return <AdminOperationsDashboardPage />
  return <EmployeeDashboardPage />
}
