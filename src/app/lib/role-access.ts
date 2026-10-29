import type { Role } from './use-role'

export const PAGE_ACCESS: Record<string, Role[]> = {
  '/login': ['owner', 'admin', 'employee'],
  '/recuperar-contrasena': ['owner', 'admin', 'employee'],
  '/aceptar-invitacion': ['owner', 'admin', 'employee'],
  '/dashboard': ['owner', 'admin', 'employee'],
  '/clients': ['owner', 'admin', 'employee'],
  '/team': ['owner', 'admin', 'employee'],
  '/operacion-mensual': ['owner', 'admin'],
  '/cobros': ['owner', 'admin'],
  '/pagos': ['owner', 'admin'],
  '/billing': ['owner', 'admin'],
  '/cuentas-corrientes': ['owner', 'admin'],
  '/cashflow': ['owner', 'admin'],
  '/reports': ['owner', 'admin'],
  '/settings': ['owner', 'admin', 'employee'],
  '/docs': ['owner', 'admin', 'employee'],
  '/notificaciones': ['owner', 'admin', 'employee'],
}

const PATH_PERMISSION: Record<string, string> = {
  '/clients': 'page.clients',
  '/team': 'page.team',
  '/operacion-mensual': 'page.monthly_operation',
  '/cobros': 'page.receivables',
  '/pagos': 'page.payments',
  '/billing': 'page.billing',
  '/cuentas-corrientes': 'page.ledger',
  '/cashflow': 'page.cashflow',
  '/reports': 'page.reports',
  '/settings': 'page.settings',
}

export function canAccessPath(role: Role, path: string, permissions: string[] | null = null): boolean {
  if (permissions !== null) {
    const pageKey = PATH_PERMISSION[path]
    return pageKey ? permissions.includes(pageKey) : true
  }
  const allowed = PAGE_ACCESS[path]
  return allowed ? allowed.includes(role) : false
}

export type TeamCapability = 'logOwnHours' | 'addOwnProduction' | 'addOwnExpense' | 'addOwnExtra'

export type TeamPerspective = 'manager' | 'self' | 'view'

export const SELF_CAPABILITIES: readonly TeamCapability[] = [
  'logOwnHours',
  'addOwnProduction',
  'addOwnExpense',
  'addOwnExtra',
] as const

export function perspectiveForRole(role: Role): TeamPerspective {
  return role === 'employee' ? 'self' : 'manager'
}

export function canSelfTrack(perspective: TeamPerspective): boolean {
  return perspective === 'self'
}

export function isManagerPerspective(perspective: TeamPerspective): boolean {
  return perspective === 'manager'
}
