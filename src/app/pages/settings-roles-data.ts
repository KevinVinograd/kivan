import type { Role } from '@/app/lib/use-role'

export type Enforcement =
  | 'enforced'
  | 'display_only'
  | 'inert'

export type PermissionLevel = 'page' | 'section' | 'action'

export type PermissionDef = {
  key: string
  label: string
  help: string
  level: PermissionLevel
  enforcement: Enforcement
  blockedBy?: string
}

export type AreaDef = {
  id: string
  label: string
  description: string
  permissions: PermissionDef[]
}

export type AccessLevel = 'none' | 'view' | 'edit' | 'full'

export const ACCESS_LEVELS: { id: AccessLevel; label: string; help: string }[] = [
  { id: 'none', label: 'Sin acceso', help: 'No ve esta parte del producto.' },
  { id: 'view', label: 'Ve', help: 'Puede mirar, no puede cambiar nada.' },
  { id: 'edit', label: 'Ve y edita', help: 'Puede crear y modificar registros.' },
  { id: 'full', label: 'Control total', help: 'Suma las acciones sensibles del área.' },
]

export const MONEY_SWITCHES: PermissionDef[] = [
  {
    key: 'client.profitability.read',
    label: 'Rentabilidad y márgenes',
    help: 'Cuánto deja cada cliente y el margen del estudio.',
    level: 'section',
    enforcement: 'enforced',
  },
  {
    key: 'report.financials.read',
    label: 'Finanzas del estudio',
    help: 'Los números consolidados del negocio en Reportes.',
    level: 'section',
    enforcement: 'enforced',
  },
  {
    key: 'member.compensation.read',
    label: 'Sueldos y honorarios del equipo',
    help: 'Lo que cobra cada persona y la nómina estimada.',
    level: 'section',
    enforcement: 'enforced',
  },
  {
    key: 'member.bank.read',
    label: 'Datos bancarios y fiscales',
    help: 'CBU, alias y CUIT de las personas del equipo.',
    level: 'section',
    enforcement: 'enforced',
  },
]

export const AREAS: AreaDef[] = [
  {
    id: 'inicio',
    label: 'Inicio',
    description: 'El panel de arranque y la actividad reciente.',
    permissions: [
      { key: 'page.dashboard', label: 'Ver el panel', help: 'Entrar a Dashboard.', level: 'page', enforcement: 'display_only' },
      { key: 'activity.read', label: 'Ver la actividad del espacio', help: 'Quién hizo qué y cuándo.', level: 'section', enforcement: 'enforced' },
    ],
  },
  {
    id: 'clientes',
    label: 'Clientes',
    description: 'La cartera y las personas asignadas a cada cliente.',
    permissions: [
      { key: 'page.clients', label: 'Ver clientes', help: 'Entrar a Clientes.', level: 'page', enforcement: 'display_only' },
      { key: 'client.read.own', label: 'Ver solo sus clientes asignados', help: 'La vista acotada para quien hace el trabajo.', level: 'section', enforcement: 'enforced', blockedBy: 'Todavía no se vincula la cuenta con la persona del equipo, así que hoy devuelve una lista vacía.' },
      { key: 'client.create', label: 'Dar de alta un cliente', help: 'Sumar un cliente nuevo a la cartera.', level: 'action', enforcement: 'enforced' },
      { key: 'client.update', label: 'Editar un cliente', help: 'Cambiar sus datos y su honorario.', level: 'action', enforcement: 'enforced' },
      { key: 'client.status.change', label: 'Pausar o dar de baja', help: 'Cambiar el estado de la relación.', level: 'action', enforcement: 'enforced' },
      { key: 'assignment.create', label: 'Asignar personas a un cliente', help: 'Definir quién trabaja en cada cuenta.', level: 'action', enforcement: 'enforced' },
      { key: 'client.export', label: 'Exportar la cartera', help: 'Bajar la lista completa a una planilla.', level: 'action', enforcement: 'display_only' },
      { key: 'client.statement.send', label: 'Enviar el estado de cuenta', help: 'Mandarle a un cliente su resumen.', level: 'action', enforcement: 'inert' },
    ],
  },
  {
    id: 'equipo',
    label: 'Equipo',
    description: 'La gente del estudio, su carga y su liquidación.',
    permissions: [
      { key: 'page.team', label: 'Ver el equipo', help: 'Entrar a Equipo.', level: 'page', enforcement: 'display_only' },
      { key: 'member.read.own', label: 'Ver solo su propio perfil', help: 'La vista de quien entra a ver lo suyo.', level: 'section', enforcement: 'enforced', blockedBy: 'Todavía no se vincula la cuenta con la persona del equipo, así que hoy no encuentra su ficha.' },
      { key: 'member.create', label: 'Sumar una persona', help: 'Dar de alta a alguien en el equipo.', level: 'action', enforcement: 'enforced' },
      { key: 'member.update', label: 'Editar una persona', help: 'Cambiar sus datos y su modalidad.', level: 'action', enforcement: 'enforced' },
      { key: 'member.deactivate', label: 'Desactivar una persona', help: 'Sacarla del equipo sin borrar su historial.', level: 'action', enforcement: 'enforced' },
      { key: 'worklog.hours.create', label: 'Cargar horas', help: 'Registrar el tiempo trabajado.', level: 'action', enforcement: 'enforced' },
      { key: 'worklog.extra.approve', label: 'Aprobar trabajos extra', help: 'Validar lo que se suma a la liquidación.', level: 'action', enforcement: 'inert' },
      { key: 'member.bank.update', label: 'Cargar datos bancarios', help: 'Dónde se le deposita a cada persona.', level: 'action', enforcement: 'enforced' },
    ],
  },
  {
    id: 'operacion',
    label: 'Operación mensual',
    description: 'El cierre del mes y todo lo que entra en él.',
    permissions: [
      { key: 'page.monthly_operation', label: 'Ver la operación mensual', help: 'Entrar al centro del mes.', level: 'page', enforcement: 'display_only' },
      { key: 'production.create', label: 'Cargar producción', help: 'Registrar lo producido en el período. A una responsable de comunicación le deja cargar las de sus clientes, sin ver montos.', level: 'action', enforcement: 'enforced' },
      { key: 'production.approve', label: 'Aprobar producciones', help: 'Confirmar que la producción se hizo: recién entonces se le cobra al cliente y se le paga a quien la hizo.', level: 'action', enforcement: 'enforced' },
      { key: 'expense.create', label: 'Cargar gastos fijos', help: 'Los costos que se repiten cada mes.', level: 'action', enforcement: 'enforced' },
      { key: 'month.close', label: 'Cerrar el mes', help: 'Dar por terminado el período. Es la acción más pesada del producto.', level: 'action', enforcement: 'enforced' },
      { key: 'month.reopen', label: 'Reabrir el mes', help: 'Volver a habilitar un período ya cerrado.', level: 'action', enforcement: 'enforced' },
      { key: 'month.checklist.set', label: 'Marcar el checklist de cierre', help: 'Ir tildando los pasos del cierre.', level: 'action', enforcement: 'enforced' },
    ],
  },
  {
    id: 'cobros',
    label: 'Cobros',
    description: 'La plata que entra y su seguimiento.',
    permissions: [
      { key: 'page.receivables', label: 'Ver cobros', help: 'Entrar a Cobros.', level: 'page', enforcement: 'display_only' },
      { key: 'receivable.create', label: 'Crear un cobro', help: 'Registrar algo por cobrar.', level: 'action', enforcement: 'enforced' },
      { key: 'receivable.generate', label: 'Generar los cobros del mes', help: 'Crear de una vez el cobro del abono de cada cliente activo.', level: 'action', enforcement: 'enforced' },
      { key: 'receivable.collect', label: 'Registrar un cobro', help: 'Marcar que el dinero entró, total o parcial.', level: 'action', enforcement: 'enforced' },
      { key: 'receivable.update', label: 'Editar un cobro', help: 'Corregir montos, fechas o notas.', level: 'action', enforcement: 'enforced' },
      { key: 'receivable.cancel', label: 'Cancelar un cobro', help: 'Anularlo y revertir su asiento.', level: 'action', enforcement: 'enforced' },
    ],
  },
  {
    id: 'pagos',
    label: 'Pagos',
    description: 'La plata que sale, a gente y a proveedores.',
    permissions: [
      { key: 'page.payments', label: 'Ver pagos', help: 'Entrar a Pagos.', level: 'page', enforcement: 'display_only' },
      { key: 'payment.create', label: 'Crear un pago', help: 'Registrar algo a pagar.', level: 'action', enforcement: 'enforced' },
      { key: 'payment.approve', label: 'Aprobar un pago', help: 'Darle el visto bueno antes de que salga.', level: 'action', enforcement: 'enforced' },
      { key: 'payment.register', label: 'Marcar un pago como hecho', help: 'Confirmar que el dinero salió.', level: 'action', enforcement: 'enforced' },
      { key: 'payout.approve', label: 'Aprobar liquidaciones del equipo', help: 'Habilitar lo que se le paga a cada persona.', level: 'action', enforcement: 'enforced' },
    ],
  },
  {
    id: 'facturacion',
    label: 'Facturación',
    description: 'Los comprobantes y los monotributos del estudio.',
    permissions: [
      { key: 'page.billing', label: 'Ver facturación', help: 'Entrar a Facturación.', level: 'page', enforcement: 'display_only' },
      { key: 'receivable.invoice.generate', label: 'Emitir un comprobante', help: 'Generar la factura de un cobro.', level: 'action', enforcement: 'enforced' },
      { key: 'receivable.invoice.associate', label: 'Asociar una factura externa', help: 'Vincular un comprobante emitido por afuera.', level: 'action', enforcement: 'enforced' },
      { key: 'receivable.invoice.send', label: 'Enviar la factura', help: 'Mandarle el comprobante al cliente.', level: 'action', enforcement: 'enforced' },
    ],
  },
  {
    id: 'cuentas',
    label: 'Cuentas corrientes',
    description: 'El saldo período a período de cada contraparte.',
    permissions: [
      { key: 'page.ledger', label: 'Ver cuentas corrientes', help: 'Entrar a Cuentas corrientes.', level: 'page', enforcement: 'display_only' },
      { key: 'ledger.export', label: 'Exportar una cuenta corriente', help: 'Bajar el detalle a una planilla.', level: 'action', enforcement: 'display_only' },
      { key: 'ledger.statement.send', label: 'Enviar cuentas corrientes', help: 'Mandar los resúmenes a las contrapartes.', level: 'action', enforcement: 'inert' },
    ],
  },
  {
    id: 'cashflow',
    label: 'Cashflow',
    description: 'La posición de caja y la proyección a trece semanas.',
    permissions: [
      { key: 'page.cashflow', label: 'Ver el cashflow', help: 'Entrar a Cashflow.', level: 'page', enforcement: 'display_only' },
      { key: 'treasury.account.create', label: 'Agregar una cuenta', help: 'Sumar una cuenta de tesorería.', level: 'action', enforcement: 'enforced' },
      { key: 'treasury.account.update', label: 'Editar una cuenta', help: 'Cambiar saldos, titular o tipo.', level: 'action', enforcement: 'enforced' },
      { key: 'treasury.account.delete', label: 'Eliminar una cuenta', help: 'Sacarla de la posición.', level: 'action', enforcement: 'enforced' },
      { key: 'treasury.commitment.create', label: 'Cargar un compromiso', help: 'Un movimiento futuro que entra a la proyección.', level: 'action', enforcement: 'enforced' },
    ],
  },
  {
    id: 'reportes',
    label: 'Reportes',
    description: 'La lectura analítica de todo lo anterior.',
    permissions: [
      { key: 'page.reports', label: 'Ver reportes', help: 'Entrar a Reportes.', level: 'page', enforcement: 'display_only' },
      { key: 'report.summary.read', label: 'Ver el resumen del período', help: 'Los números de cabecera del mes.', level: 'section', enforcement: 'enforced' },
      { key: 'report.export', label: 'Exportar reportes', help: 'Bajar los informes a una planilla.', level: 'action', enforcement: 'display_only' },
    ],
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    description: 'El espacio de trabajo, la gente y sus accesos.',
    permissions: [
      { key: 'page.settings', label: 'Ver configuración', help: 'Entrar a Configuración.', level: 'page', enforcement: 'display_only' },
      { key: 'workspace.update', label: 'Editar el espacio de trabajo', help: 'Identidad del estudio, zona horaria y moneda.', level: 'action', enforcement: 'enforced' },
      { key: 'user.invite', label: 'Invitar personas', help: 'Sumar a alguien con acceso al espacio.', level: 'action', enforcement: 'enforced' },
      { key: 'user.role.change', label: 'Cambiar el rol de alguien', help: 'Mover a una persona de un rol a otro.', level: 'action', enforcement: 'enforced' },
      { key: 'user.deactivate', label: 'Quitarle el acceso a alguien', help: 'Desactivar su cuenta y cerrar sus sesiones.', level: 'action', enforcement: 'enforced' },
      { key: 'role.manage', label: 'Administrar roles', help: 'Crear roles y definir qué puede hacer cada uno.', level: 'action', enforcement: 'inert' },
      { key: 'user.ownership.transfer', label: 'Transferir la propiedad', help: 'Pasarle el rol de Dueño a otra persona.', level: 'action', enforcement: 'inert' },
    ],
  },
]

export type RoleDef = {
  id: string
  name: string
  description: string
  isSystem: boolean
  systemRole?: Role
  access: Record<string, AccessLevel>
  money: Record<string, boolean>
}

const allAreas = (level: AccessLevel): Record<string, AccessLevel> =>
  Object.fromEntries(AREAS.map((area) => [area.id, level]))

const allMoney = (on: boolean): Record<string, boolean> =>
  Object.fromEntries(MONEY_SWITCHES.map((permission) => [permission.key, on]))

export const SYSTEM_ROLES: RoleDef[] = [
  {
    id: 'owner',
    name: 'Dueño',
    description: 'Ve y hace todo, y es el único que gobierna a los demás administradores.',
    isSystem: true,
    systemRole: 'owner',
    access: allAreas('full'),
    money: allMoney(true),
  },
  {
    id: 'admin',
    name: 'Admin',
    description: 'Corre la operación y el cierre, con la misma visibilidad de la plata que el Dueño.',
    isSystem: true,
    systemRole: 'admin',
    access: { ...allAreas('full'), configuracion: 'edit' },
    money: allMoney(true),
  },
  {
    id: 'employee',
    name: 'Equipo',
    description: 'Hace el trabajo del cliente y registra lo suyo. Nunca ve la plata del estudio.',
    isSystem: true,
    systemRole: 'employee',
    access: {
      ...allAreas('none'),
      inicio: 'view',
      clientes: 'view',
      equipo: 'view',
      configuracion: 'view',
    },
    money: allMoney(false),
  },
]

export function grantedByLevel(permission: PermissionDef, level: AccessLevel): boolean {
  if (level === 'none') return false
  if (level === 'view') return permission.level !== 'action'
  if (level === 'edit') return permission.level !== 'action' || permission.enforcement === 'enforced'
  return true
}

export function materializeGrants(
  access: Record<string, AccessLevel>,
  money: Record<string, boolean>,
  overrides: Record<string, boolean> = {},
): string[] {
  const keys: string[] = []
  for (const permission of MONEY_SWITCHES) {
    if (money[permission.key]) keys.push(permission.key)
  }
  for (const area of AREAS) {
    const level = access[area.id] ?? 'none'
    for (const permission of area.permissions) {
      const granted =
        permission.key in overrides ? overrides[permission.key] : grantedByLevel(permission, level)
      if (granted) keys.push(permission.key)
    }
  }
  return keys
}

export function deriveUiState(grants: string[]): {
  access: Record<string, AccessLevel>
  money: Record<string, boolean>
  overrides: Record<string, boolean>
} {
  const held = new Set(grants)
  const access: Record<string, AccessLevel> = {}
  const overrides: Record<string, boolean> = {}

  for (const area of AREAS) {
    const match = ACCESS_LEVELS.find((stop) =>
      area.permissions.every((permission) => held.has(permission.key) === grantedByLevel(permission, stop.id)),
    )
    if (match) {
      access[area.id] = match.id
    } else {
      access[area.id] = 'none'
      for (const permission of area.permissions) overrides[permission.key] = held.has(permission.key)
    }
  }

  const money = Object.fromEntries(MONEY_SWITCHES.map((p) => [p.key, held.has(p.key)]))
  return { access, money, overrides }
}

export function roleEditorState(role: { key: string | null; isSystem: boolean; grants: string[] }): {
  access: Record<string, AccessLevel>
  money: Record<string, boolean>
  overrides: Record<string, boolean>
} {
  if (role.isSystem) {
    const system = SYSTEM_ROLES.find((r) => r.systemRole === role.key)
    if (system) return { access: system.access, money: system.money, overrides: {} }
  }
  return deriveUiState(role.grants)
}

export function enforcementTally() {
  const all = [...MONEY_SWITCHES, ...AREAS.flatMap((area) => area.permissions)]
  return {
    total: all.length,
    enforced: all.filter((p) => p.enforcement === 'enforced').length,
    displayOnly: all.filter((p) => p.enforcement === 'display_only').length,
    inert: all.filter((p) => p.enforcement === 'inert').length,
  }
}
