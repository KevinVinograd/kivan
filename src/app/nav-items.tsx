import { ICON } from '@/app/lib/icon-registry'
import type { NavEntry, NavItem } from '@/app/components/shell'

/**
 * MVP navigation model. Dashboard leads the rail and is the app's landing route
 * (the owner cockpit); the operative core follows: Clientes, Equipo, Operación
 * mensual, then a collapsible Finanzas group. Operación mensual is the monthly
 * operating hub (cobros, facturación, pagos al equipo, producciones, gastos,
 * alertas y cierre) and stays a top-level entry.
 *
 * Finanzas is a disclosure group with no route of its own — it expands to reveal
 * its operative cash surfaces: Cobros (`/cobros`) and Pagos (`/pagos`) — two
 * distinct pages, each with its own master-detail table — plus Facturación
 * (`/billing`, a placeholder until the comprobantes/ARCA module ships). Reportes
 * is read-only analytics, not a cash surface, so it stays a top-level entry
 * outside the group.
 *
 * Configuración lives in the footer (settings convention), kept apart from the
 * operative modules. Labels are product copy (Spanish); icons are semantic
 * registry components (`ICON`)
 * passed as component references — SideNav renders them (decorative, aria-hidden)
 * and switches the active item to `weight="fill"`. Group children are text-only;
 * the group's `ICON.finance` names the cluster (and the icon on the collapsed
 * rail's flyout trigger).
 */
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

/** Footer nav — Guía y Configuración viven apart from the operative modules. */
export const footerNavItems: NavItem[] = [
  // The unread count is attached in App (the rail is static; the badge is live data).
  { label: 'Avisos', href: '/notificaciones', icon: ICON.notifications },
  { label: 'Guía', href: '/docs', icon: ICON.docs },
  { label: 'Configuración', href: '/settings', icon: ICON.settings },
]
