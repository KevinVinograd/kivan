/**
 * Employee Dashboard — typed models.
 *
 * The employee variant is a read-only personal cockpit: these types describe the
 * data one team member sees about their own work for a month (assigned clients,
 * objectives, pending items, hours, productions/tasks, extras/viáticos and
 * client-scoped operational alerts). None of these sections has a backend source
 * yet, so `employee-dashboard-data.ts` builds them empty; these types carry no
 * owner/admin-sensitive figures (revenue, margin, profit, other people's pay,
 * banking, ARCA). Money is stored as numbers, dates as ISO strings, and
 * formatting happens only at render via `employee-dashboard-format.ts`.
 */
import type { MonthId } from './monthly-operation-mock-data'

/** A navigation target for a section/item CTA (always an existing in-app route). */
export type EmployeeCta = { label: string; href: string }

// ── Mis pendientes (§2) ──────────────────────────────────────────────────────
export type PendingType =
  | 'horas'
  | 'tarea'
  | 'produccion'
  | 'extra'
  | 'viatico'
  | 'seguimiento'
  | 'feedback'
  | 'objetivo'

export type PendingStatus = 'pendiente' | 'atencion' | 'vencido'

/** One prioritized pending-work row. `order` drives the list sort (lower first). */
export type PendingItem = {
  id: string
  title: string
  client: string
  type: PendingType
  /** Human due label, e.g. "Hoy", "Mañana", "Esta semana", "24 Jun". */
  due: string
  status: PendingStatus
  description: string
  cta: EmployeeCta
  order: number
}

// ── Mis clientes (§3) ────────────────────────────────────────────────────────
export type AssignedClientStatus = 'al_dia' | 'atencion' | 'pendiente'

/** One assigned client from the employee's operational perspective (no margin). */
export type AssignedClient = {
  clientId: string
  name: string
  /** The employee's role on this client, e.g. "Contenido". */
  role: string
  /** Scope summary, e.g. "Social media + producción". */
  services: string
  objectivesDone: number
  objectivesTotal: number
  hoursLoaded: number
  pendingTasks: number
  /** Last feedback/reunion (ISO), for the "Última reunión" line. */
  lastFeedbackIso?: string
  status: AssignedClientStatus
}

// ── Objetivos del mes (§4) ───────────────────────────────────────────────────
export type ObjectiveStatus = 'en_curso' | 'completado' | 'en_riesgo' | 'vencido'

/** One employee-owned objective tied to an assigned client. */
export type Objective = {
  id: string
  title: string
  client: string
  clientId: string
  /** Completion 0-100. */
  progress: number
  /** Human due label, e.g. "24 Jun", "Ayer". */
  due: string
  status: ObjectiveStatus
}

// ── Horas cargadas (§5) ──────────────────────────────────────────────────────
export type HoursStatus = 'completo' | 'incompleto' | 'sin_carga'

/** One client's hours-loading row for the breakdown list. */
export type ClientHours = {
  clientId: string
  client: string
  loaded: number
  /** Planned/expected hours when known, else `null` ("No disponible"). */
  expected: number | null
  status: HoursStatus
}

/** Hours summary metrics + per-client breakdown. */
export type HoursSummary = {
  loadedThisWeek: number
  loadedThisMonth: number
  /** Expected hours this month when known, else `null`. */
  expectedThisMonth: number | null
  missingHours: number
  clientsWithoutHoursThisWeek: number
  breakdown: ClientHours[]
}

// ── Producciones y tareas (§6) ───────────────────────────────────────────────
export type TaskStatus = 'pendiente' | 'en_curso' | 'completado' | 'vencido'
export type TaskKind = 'produccion' | 'tarea'

/** One production or operational task tied to a client. */
export type TaskItem = {
  id: string
  title: string
  client: string
  kind: TaskKind
  /** Human date label, e.g. "22 Jun", "Mañana". */
  date: string
  status: TaskStatus
  cta: EmployeeCta
}

/** Productions/tasks summary metrics + items. */
export type TasksSummary = {
  assigned: number
  pending: number
  dueThisWeek: number
  overdue: number
  items: TaskItem[]
}

// ── Extras y viáticos (§7) ───────────────────────────────────────────────────
export type ExtraKind = 'extra' | 'viatico'
export type ExtraStatus = 'pendiente' | 'declarado' | 'en_revision' | 'aprobado'

/** One extra-work or viático row. `amount` is `null` when not yet quantified. */
export type ExtraItem = {
  id: string
  kind: ExtraKind
  /** Related client or production, e.g. "Bruma Home", "Producción Palermo". */
  context: string
  /** Short detail, e.g. "2 h fuera de scope". */
  detail: string
  amount: number | null
  status: ExtraStatus
  cta: EmployeeCta
}

/** Extras/viáticos summary metrics + items. */
export type ExtrasSummary = {
  extrasPending: number
  extrasDeclared: number
  viaticsPending: number
  viaticsLoaded: number
  items: ExtraItem[]
}

// ── Alertas de mis clientes (§8) ─────────────────────────────────────────────
/** Safe operational tone for a client alert (never financial risk). */
export type EmployeeAlertTone = 'warning' | 'danger' | 'neutral'

/** One client-scoped operational alert relevant to the employee's work. */
export type EmployeeAlert = {
  id: string
  title: string
  description: string
  /** Short category pill, e.g. "Seguimiento", "Tareas", "Horas". */
  tag: string
  tone: EmployeeAlertTone
  cta: EmployeeCta
}

// ── Actividad reciente (§9) ──────────────────────────────────────────────────
/** Activity event kind — the timeline maps each to a registered leading icon. */
export type EmployeeActivityKind = 'horas' | 'extra' | 'feedback' | 'viatico' | 'produccion' | 'reunion'

/**
 * An entity referenced in an activity line. `client` and `member` render as
 * hover link-text with a preview + "Ver perfil"; `plain` (e.g. a production,
 * which has no profile page) renders as static text.
 */
export type EmployeeActivityEntity =
  | { kind: 'client'; id: string; name: string }
  | { kind: 'member'; id: string; name: string; role: string }
  | { kind: 'plain'; name: string }

/** One recent-activity entry: actor + action + context, newest first. */
export type EmployeeActivityItem = {
  id: string
  activity: EmployeeActivityKind
  actor: EmployeeActivityEntity
  /** Connecting verb phrase between actor and context, e.g. "cargó 4 h para". */
  action: string
  context: EmployeeActivityEntity
  iso: string
}

// ── Mi resumen (§1) ──────────────────────────────────────────────────────────
/** The four summary KPIs, derived from the sections below. */
export type EmployeeSummary = {
  assignedClients: number
  activeClients: number
  objectivesCompleted: number
  objectivesTotal: number
  hoursLoaded: number
  missingHours: number
  pendingCount: number
}

/** Everything the Employee Dashboard renders for one month. */
export type EmployeeDashboardData = {
  monthId: MonthId
  monthLabel: string
  employeeName: string
  /** False when the employee has no assigned clients/objectives this month. */
  hasData: boolean
  summary: EmployeeSummary
  pending: PendingItem[]
  clients: AssignedClient[]
  objectives: Objective[]
  hours: HoursSummary
  tasks: TasksSummary
  extras: ExtrasSummary
  alerts: EmployeeAlert[]
  activity: EmployeeActivityItem[]
}
