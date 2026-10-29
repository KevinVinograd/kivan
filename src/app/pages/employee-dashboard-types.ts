import type { MonthId } from './monthly-operation-mock-data'

export type EmployeeCta = { label: string; href: string }

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

export type PendingItem = {
  id: string
  title: string
  client: string
  type: PendingType
  due: string
  status: PendingStatus
  description: string
  cta: EmployeeCta
  order: number
}

export type AssignedClientStatus = 'al_dia' | 'atencion' | 'pendiente'

export type AssignedClient = {
  clientId: string
  name: string
  role: string
  services: string
  objectivesDone: number
  objectivesTotal: number
  hoursLoaded: number
  pendingTasks: number
  lastFeedbackIso?: string
  status: AssignedClientStatus
}

export type ObjectiveStatus = 'en_curso' | 'completado' | 'en_riesgo' | 'vencido'

export type Objective = {
  id: string
  title: string
  client: string
  clientId: string
  progress: number
  due: string
  status: ObjectiveStatus
}

export type HoursStatus = 'completo' | 'incompleto' | 'sin_carga'

export type ClientHours = {
  clientId: string
  client: string
  loaded: number
  expected: number | null
  status: HoursStatus
}

export type HoursSummary = {
  loadedThisWeek: number
  loadedThisMonth: number
  expectedThisMonth: number | null
  missingHours: number
  clientsWithoutHoursThisWeek: number
  breakdown: ClientHours[]
}

export type TaskStatus = 'pendiente' | 'en_curso' | 'completado' | 'vencido'
export type TaskKind = 'produccion' | 'tarea'

export type TaskItem = {
  id: string
  title: string
  client: string
  kind: TaskKind
  date: string
  status: TaskStatus
  cta: EmployeeCta
}

export type TasksSummary = {
  assigned: number
  pending: number
  dueThisWeek: number
  overdue: number
  items: TaskItem[]
}

export type ExtraKind = 'extra' | 'viatico'
export type ExtraStatus = 'pendiente' | 'declarado' | 'en_revision' | 'aprobado'

export type ExtraItem = {
  id: string
  kind: ExtraKind
  context: string
  detail: string
  amount: number | null
  status: ExtraStatus
  cta: EmployeeCta
}

export type ExtrasSummary = {
  extrasPending: number
  extrasDeclared: number
  viaticsPending: number
  viaticsLoaded: number
  items: ExtraItem[]
}

export type EmployeeAlertTone = 'warning' | 'danger' | 'neutral'

export type EmployeeAlert = {
  id: string
  title: string
  description: string
  tag: string
  tone: EmployeeAlertTone
  cta: EmployeeCta
}

export type EmployeeActivityKind = 'horas' | 'extra' | 'feedback' | 'viatico' | 'produccion' | 'reunion'

export type EmployeeActivityEntity =
  | { kind: 'client'; id: string; name: string }
  | { kind: 'member'; id: string; name: string; role: string }
  | { kind: 'plain'; name: string }

export type EmployeeActivityItem = {
  id: string
  activity: EmployeeActivityKind
  actor: EmployeeActivityEntity
  action: string
  context: EmployeeActivityEntity
  iso: string
}

export type EmployeeSummary = {
  assignedClients: number
  activeClients: number
  objectivesCompleted: number
  objectivesTotal: number
  hoursLoaded: number
  missingHours: number
  pendingCount: number
}

export type EmployeeDashboardData = {
  monthId: MonthId
  monthLabel: string
  employeeName: string
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
