import type { NavigateFunction } from 'react-router'

import type { PageHeaderAction } from '@/app/components/templates'
import { ICON } from '@/app/lib/icon-registry'
import { CLIENTS_HREF, SELF_CARGA_HREF } from './employee-dashboard-nav'
import { withDashboardTrail } from './dashboard-trail'

/**
 * Employee Dashboard header actions: the two page CTAs. The dashboard is pinned
 * to the current month (no period selector — like the Owner dashboard). "Cargar
 * horas" routes to the employee's own profile on /team ("Mi trabajo"), where their
 * carga and hours live (employees are route-locked out of Operación mensual). On
 * mobile the primary "Cargar horas" stays visible and "Ver mis clientes"
 * collapses into the overflow menu.
 */
export function employeeDashboardHeaderActions(navigate: NavigateFunction): PageHeaderAction[] {
  return [
    {
      key: 'hours',
      label: 'Cargar horas',
      icon: ICON.logHours,
      variant: 'solid',
      primary: true,
      onClick: () => navigate(SELF_CARGA_HREF),
    },
    {
      key: 'clients',
      label: 'Ver mis clientes',
      icon: ICON.clients,
      variant: 'outlined',
      iconOnly: true,
      onClick: () => navigate(withDashboardTrail(CLIENTS_HREF)),
    },
  ]
}
