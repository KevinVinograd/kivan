import type { NavigateFunction } from 'react-router'

import type { PageHeaderAction } from '@/app/components/templates'
import { ICON } from '@/app/lib/icon-registry'
import { CLIENTS_HREF, SELF_CARGA_HREF } from './employee-dashboard-nav'
import { withDashboardTrail } from './dashboard-trail'

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
