import type { Role } from '@/app/lib/use-role'
import { ICON, type Icon } from '@/app/lib/icon-registry'

/** Stable id for each Configuración section. Drives the rail and the router. */
export type SettingsSectionId =
  | 'workspace'
  | 'members'
  | 'roles'
  | 'fiscal'
  | 'operation'
  | 'cashflow'
  | 'notifications'
  | 'appearance'
  | 'profile'

export type SettingsSection = {
  id: SettingsSectionId
  /** Rail label (Spanish product copy). */
  label: string
  /** One-line summary shown under the label in the section rail. */
  description: string
  /** Leading glyph for the rail. Omitted for `profile`, which shows an Avatar. */
  icon?: Icon
  /** Roles allowed to see and open this section. */
  roles: Role[]
}

/** Workspace-level sections are owner/admin only. */
const WORKSPACE_ROLES: Role[] = ['owner', 'admin']
/**
 * Defining what a role may see and do is account governance, and governance is
 * the one place owner and admin differ. An
 * admin who could edit roles could grant themselves anything, so this section is
 * owner-only — the same reasoning that gates the ownership-transfer group.
 */
const OWNER_ONLY: Role[] = ['owner']
/** Personal sections are open to every role. */
const ALL_ROLES: Role[] = ['owner', 'admin', 'employee']

/**
 * The Configuración section registry — the single source that feeds both the
 * left section rail and the content router in `settings-page`. Role scope lives
 * here per section: workspace settings (identity, members, fiscal, operation)
 * are owner/admin only, while the personal sections (notifications, appearance,
 * profile) are open to every role, so a member of the Equipo only ever sees
 * their own preferences. Array order is the rail order.
 */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'workspace',
    label: 'Espacio de trabajo',
    description: 'Identidad del estudio, zona horaria y moneda.',
    icon: ICON.workspace,
    roles: WORKSPACE_ROLES,
  },
  {
    id: 'members',
    label: 'Miembros y roles',
    description: 'Personas con acceso y su rol.',
    icon: ICON.team,
    roles: WORKSPACE_ROLES,
  },
  {
    id: 'roles',
    label: 'Roles y permisos',
    description: 'Qué puede ver y hacer cada rol.',
    icon: ICON.roles,
    roles: OWNER_ONLY,
  },
  {
    id: 'fiscal',
    label: 'Fiscal y facturación',
    description: 'Datos fiscales, ARCA y métodos de cobro.',
    icon: ICON.invoice,
    roles: WORKSPACE_ROLES,
  },
  {
    id: 'operation',
    label: 'Operación mensual',
    description: 'Cierre del mes, categorías y reglas de pago.',
    icon: ICON.monthlyOperation,
    roles: WORKSPACE_ROLES,
  },
  {
    id: 'cashflow',
    label: 'Cashflow',
    description: 'Cuentas de tesorería y posición.',
    icon: ICON.finance,
    roles: WORKSPACE_ROLES,
  },
  {
    id: 'notifications',
    label: 'Notificaciones',
    description: 'Canales y eventos que te avisan.',
    icon: ICON.notifications,
    roles: ALL_ROLES,
  },
  {
    id: 'appearance',
    label: 'Apariencia',
    description: 'Tema claro u oscuro.',
    icon: ICON.appearance,
    roles: ALL_ROLES,
  },
  {
    id: 'profile',
    label: 'Mi perfil',
    description: 'Tus datos y la seguridad de tu cuenta.',
    roles: ALL_ROLES,
  },
]

/**
 * Sections hidden from the rail until they are wired to a real backend.
 *
 * Each one today only mutates local React state and shows a "guardado" toast that
 * persists nothing (the 2026-07-27 action-completeness audit, backlog #1). Rather than
 * surface a control that lies, they are hidden (not deleted): the section components and
 * this registry stay intact, so re-enabling a section once it persists is a one-line
 * removal from this set. Tracked as pending, not shipped as a promise.
 *
 * Espacio de trabajo and Operación mensual are now WIRED (they load + persist via
 * `GET`/`PUT /workspace` — the latter as the `monthlyRules` document, whose vocabularies
 * the gasto / producción pickers read), so both are out of this set and visible again.
 * The genuinely-real sections (Miembros, Roles, Cashflow, Apariencia, Mi perfil) were
 * already visible. Notificaciones is wired too (per-user in-app preferences via
 * `/me/notification-preferences`; its Email/WhatsApp channels and the time-based reminder
 * were removed rather than kept as promises nothing could keep). Still hidden: Fiscal
 * (fake ARCA "Conectado" badge, no persistence).
 */
const HIDDEN_UNTIL_WIRED: ReadonlySet<SettingsSectionId> = new Set(['fiscal'])

/** Sections a role may see, in rail order — minus the ones hidden until they persist. */
export function sectionsForRole(role: Role): SettingsSection[] {
  return SETTINGS_SECTIONS.filter(
    (section) => section.roles.includes(role) && !HIDDEN_UNTIL_WIRED.has(section.id),
  )
}
