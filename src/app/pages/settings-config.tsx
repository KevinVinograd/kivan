import type { Role } from '@/app/lib/use-role'
import { ICON, type Icon } from '@/app/lib/icon-registry'

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
  label: string
  description: string
  icon?: Icon
  roles: Role[]
}

const WORKSPACE_ROLES: Role[] = ['owner', 'admin']
const OWNER_ONLY: Role[] = ['owner']
const ALL_ROLES: Role[] = ['owner', 'admin', 'employee']

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

const HIDDEN_UNTIL_WIRED: ReadonlySet<SettingsSectionId> = new Set(['fiscal'])

export function sectionsForRole(role: Role): SettingsSection[] {
  return SETTINGS_SECTIONS.filter(
    (section) => section.roles.includes(role) && !HIDDEN_UNTIL_WIRED.has(section.id),
  )
}
