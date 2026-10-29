import { ICON } from '@/app/lib/icon-registry'
import type { NavEntry, NavItem } from '@/app/components/shell'

export const navItems: NavEntry[] = [
  { label: 'Dashboard', href: '/dashboard', icon: ICON.dashboard },
  { label: 'Clientes', href: '/clients', icon: ICON.clients },
  { label: 'Equipo', href: '/team', icon: ICON.team },
  { label: 'Operación mensual', href: '/operacion-mensual', icon: ICON.monthlyOperation },
  {
    label: 'Finanzas',
    icon: ICON.finance,
    children: [
      { label: 'Cobros', href: '/cobros' },
      { label: 'Pagos', href: '/pagos' },
      { label: 'Facturación', href: '/billing' },
      { label: 'Cuentas corrientes', href: '/cuentas-corrientes' },
      { label: 'Cashflow', href: '/cashflow' },
    ],
  },
  { label: 'Reportes', href: '/reports', icon: ICON.reports },
]

export const footerNavItems: NavItem[] = [
  { label: 'Avisos', href: '/notificaciones', icon: ICON.notifications },
  { label: 'Guía', href: '/docs', icon: ICON.docs },
  { label: 'Configuración', href: '/settings', icon: ICON.settings },
]
