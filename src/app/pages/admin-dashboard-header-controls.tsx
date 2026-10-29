import type { NavigateFunction } from 'react-router'

import type { PageHeaderAction } from '@/app/components/templates'
import { ICON } from '@/app/lib/icon-registry'
import { withDashboardTrail } from './dashboard-trail'

export function adminDashboardHeaderActions(navigate: NavigateFunction): PageHeaderAction[] {
  return [
    {
      key: 'payments',
      label: 'Ver pagos',
      icon: ICON.payment,
      variant: 'outlined',
      iconOnly: true,
      onClick: () => navigate(withDashboardTrail('/operacion-mensual?block=equipo')),
    },
    {
      key: 'monthly',
      label: 'Continuar operación mensual',
      mobileLabel: 'Operación mensual',
      icon: ICON.monthlyOperation,
      variant: 'solid',
      primary: true,
      onClick: () => navigate(withDashboardTrail('/operacion-mensual')),
    },
  ]
}
