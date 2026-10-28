import type { Role } from './use-role'

/**
 * Page-level role access — the single source of truth for which roles may reach
 * each route. Keyed by absolute route path (matching the nav `href` and the
 * router location), NOT the `NavItem` type, which lives in the protected shell
 * layer. Drives both the SideNav filtering in App and the route guards in the
 * router, so a page hidden from a role's rail is also unreachable by URL. A path
 * absent from this map is DENIED to every role (fail-closed — see `canAccessPath`).
 *
 * Note: `/clients` and `/team` are open to every role, but the employee
 * perspective is restricted in-page (assigned clients only / own profile only)
 * via the signed-in user's `teamMemberId` (`useAuth().me`). The finance and analytics surfaces
 * `/operacion-mensual`, `/reports`, and the Finanzas group (`/cobros`, `/pagos`,
 * `/billing`) are owner/admin-only (hidden from the rail + route-locked), so the
 * employee (Equipo) never sees a cash surface.
 *
 * Every concrete route in `router.tsx` and every nav `href` in `nav-items.tsx`
 * MUST appear here — with fail-closed access, an absent entry is unreachable for
 * everyone, so a new page always needs an explicit role decision here.
 */
export const PAGE_ACCESS: Record<string, Role[]> = {
  // Pre-auth surfaces: these entries exist only so `route-access-completeness`
  // covers the `/login`, `/recuperar-contrasena` and `/aceptar-invitacion` routes.
  // They are not consulted by `canAccessPath` — all render outside the role-gated
  // shell (no nav item, no RoleGate).
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
  // Guía de uso: abierta a todo rol (es documentación, sin datos sensibles). It is
  // deliberately absent from PATH_PERMISSION below so a custom role reaches it too.
  '/docs': ['owner', 'admin', 'employee'],
  // Avisos: your own inbox — every role has one. Absent from PATH_PERMISSION below so a
  // custom role reaches it too (nobody should be locked out of their own notices).
  '/notificaciones': ['owner', 'admin', 'employee'],
}

/**
 * Route path → the custom-role catalogue's `page.*` grant key. Used ONLY when a custom role
 * is in force; built-in roles ignore this and use PAGE_ACCESS. `/dashboard` is intentionally
 * absent: it is every role's landing + the redirect fallback, so it stays reachable for any
 * session (denying it would loop RoleGate).
 */
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

/**
 * Whether the session may reach the route. Two layers:
 *  - built-in role (`permissions === null`): FAIL-CLOSED against PAGE_ACCESS, exactly as
 *    before — a path not in the map is denied to every role.
 *  - custom role (`permissions` set): the path's `page.*` grant must be held. A path with no
 *    page key (pre-auth utility routes, /dashboard) stays reachable so navigation never traps.
 * The backend authorizes independently; this is the front's matching gate.
 */
export function canAccessPath(role: Role, path: string, permissions: string[] | null = null): boolean {
  if (permissions !== null) {
    const pageKey = PATH_PERMISSION[path]
    return pageKey ? permissions.includes(pageKey) : true
  }
  const allowed = PAGE_ACCESS[path]
  return allowed ? allowed.includes(role) : false
}

/**
 * Single source of truth for the self-vs-manager action boundary on the Team
 * surface. TeamDetail and its callers gate on a `TeamPerspective`, not scattered
 * `role === 'employee'` checks. Manager actions (payment approve / dispatch /
 * confirm, assign-to-client, edit / deactivate member, create) are never granted
 * to the self perspective; the employee gets only the self-tracking capabilities.
 */
export type TeamCapability = 'logOwnHours' | 'addOwnProduction' | 'addOwnExpense' | 'addOwnExtra'

/**
 * How a TeamDetail is being viewed:
 * - `manager` — owner/admin acting on any member (full manager actions).
 * - `self`    — the employee acting on their own profile (the four self-track
 *               actions only; no manager actions).
 * - `view`    — a read-only context (no actions at all). Replaces the former
 *               binary `readOnly` flag for non-actionable surfaces.
 */
export type TeamPerspective = 'manager' | 'self' | 'view'

/** The four self work-tracking capabilities granted to the `self` perspective. */
export const SELF_CAPABILITIES: readonly TeamCapability[] = [
  'logOwnHours',
  'addOwnProduction',
  'addOwnExpense',
  'addOwnExtra',
] as const

/** Map the active role to its default TeamDetail perspective. Employee = self;
 *  owner/admin = manager. Read-only contexts pass `view` explicitly instead. */
export function perspectiveForRole(role: Role): TeamPerspective {
  return role === 'employee' ? 'self' : 'manager'
}

/** Whether the perspective may perform the four self work-tracking actions. */
export function canSelfTrack(perspective: TeamPerspective): boolean {
  return perspective === 'self'
}

/** Whether the perspective may perform manager-only actions (payment lifecycle,
 *  assign-to-client, edit / deactivate, plus the master-detail close chrome). */
export function isManagerPerspective(perspective: TeamPerspective): boolean {
  return perspective === 'manager'
}
