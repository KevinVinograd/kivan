import type { NavigateFunction } from 'react-router'

import type { PageHeaderAction } from '@/app/components/templates'
import { ICON } from '@/app/lib/icon-registry'
import { withDashboardTrail } from './dashboard-trail'

/**
 * Admin / Operations Dashboard header actions: the two page CTAs. The dashboard
 * is pinned to the current month (no period selector — like the Owner dashboard,
 * period navigation lives in Reportes and Operación mensual). "Ver pagos" sits on
 * the left, the primary "Continuar operación mensual" on the right. Both route to
 * the monthly close hub (`/operacion-mensual`). On mobile the primary stays
 * visible and "Ver pagos" collapses into the overflow menu.
 */
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
