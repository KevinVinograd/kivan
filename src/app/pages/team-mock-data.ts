/**
 * Team snapshot model + PURE derivation helpers (the §17 PRD activity layer).
 *
 * The shared model types (`TeamMember`, `ClientAssignment`, `Client`) live in
 * `clients-mock-data.ts` and are re-exported here as the single import source for the
 * Team files. This module carries NO fabricated data: the `TeamDataProvider`
 * (team-data.tsx) seeds its snapshot from EMPTY_TEAM_DATA and fills `members` from the
 * real roster (GET /team-members); everything here is a pure helper that reads a
 * {@link TeamDataSnapshot}, so carga, pago estimado and the statuses recompute live off
 * real data (empty until it exists). Formatting happens only at render via `team-format.ts`.
 */
import { currentPeriod, toMonthId } from '@/app/lib/periods'
import type { Client, ClientAssignment, TeamMember } from './clients-mock-data'

// Re-export the shared model so Team files have a single import source.
export type {
  TeamMember,
  BankDetails,
  Client,
  Compensation,
  CompensationModel,
  EmploymentType,
  TeamMemberStatus,
  ClientAssignment,
  AssignmentStatus,
} from './clients-mock-data'

/**
 * Current period the Team page operates on (PRD "Mes"), as `'YYYY-MM'`.
 *
 * A SIXTH copy of the pinned-month bug, and a live one rather than a fixture: it was the
 * literal `'2026-06'`, and it does not only default the mock generators below. It stamps the
 * `month` of every work entry a user logs (`team-data.tsx`) and seeds the date pre-filled in
 * the work-log dialogs, which built their default date as this month plus "-16" — the same
 * 16 June 2026 that `TODAY` used to pin in the finance dialogs. Somebody logging hours today
 * filed them under June.
 *
 * A function, not a const: a const evaluated at module load goes stale in a tab left open
 * across a month boundary.
 */
export function currentTeamMonth(): string {
  return toMonthId(currentPeriod())
}

/** Team payments are due on this day of the statement month; past it the payment is overdue. */
export const PAYMENT_DUE_DAY = 10

// ── Statuses ─────────────────────────────────────────────────────────────────
/** Member monthly payment state (PRD §13 Estado de pago). */
export type TeamPaymentStatus =
  | 'pending'
  | 'review'
  | 'approved'
  | 'processing'
  | 'paid'
  | 'with_difference'
/** Monthly load band (PRD §13 Estado de carga); `undefined` = "Sin objetivo". */
export type LoadStatus = 'low' | 'normal' | 'high' | 'overloaded'
export type ProductionStatus = 'pending' | 'review' | 'approved' | 'paid'
export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'paid'
export type ExtraStatus = 'pending' | 'approved' | 'rejected' | 'paid'

// ── Activity entities (PRD §17) ──────────────────────────────────────────────
export type TimeEntry = {
  id: string
  teamMemberId: string
  clientId: string
  clientName: string
  taskType: string
  date: string
  month: string
  hours: number
  description?: string
  isOutOfScope: boolean
  /** Who logged this entry (the member self-logging, or an admin on their behalf). */
  loggedBy?: string
}

export type ProductionEntry = {
  id: string
  teamMemberId: string
  clientId: string
  clientName: string
  date: string
  type: string
  quantity?: number
  hours?: number
  amount?: number
  status: ProductionStatus
  notes?: string
  /** Who logged this entry (member self-logging, or an admin on their behalf). */
  loggedBy?: string
}

/** Viático (expense reimbursement). */
export type ExpenseEntry = {
  id: string
  teamMemberId: string
  clientId?: string
  clientName?: string
  productionId?: string
  date: string
  concept: string
  amount: number
  status: ExpenseStatus
  notes?: string
  /** Who logged this entry (member self-logging, or an admin on their behalf). */
  loggedBy?: string
}

export type ExtraWorkEntry = {
  id: string
  teamMemberId: string
  clientId: string
  clientName: string
  date: string
  description: string
  type?: string
  hours?: number
  quantity?: number
  amount: number
  status: ExtraStatus
  approvedBy?: string
  /** Who logged this entry (member self-logging, or an admin on their behalf). */
  loggedBy?: string
}

// ── Tasks & objectives (PRD §17 — member work items and goals) ───────────────
/** Lifecycle of a member work item. */
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'overdue'

/** A work item assigned to a member, optionally scoped to a client. */
export type MemberTask = {
  id: string
  teamMemberId: string
  clientId?: string
  clientName?: string
  title: string
  dueDate: string
  status: TaskStatus
}

/** Progress band of a member goal. */
export type ObjectiveStatus = 'on_track' | 'at_risk' | 'completed' | 'overdue'

/** A member goal with a 0–100 progress, optionally scoped to a client. */
export type MemberObjective = {
  id: string
  teamMemberId: string
  clientName?: string
  title: string
  progress: number // 0–100
  dueDate: string
  status: ObjectiveStatus
}

export type MonthlyTeamStatement = {
  id: string
  teamMemberId: string
  month: string
  baseAmount: number
  hoursAmount: number
  productionsAmount: number
  extrasAmount: number
  expensesAmount: number
  adjustmentsAmount: number
  deductionsAmount: number
  totalAmount: number
  status: TeamPaymentStatus
  /** Amount already settled — equals the total when paid, a partial when short-paid. */
  paidAmount?: number
  /** Outstanding gap when status is `with_difference` / `processing` (totalAmount − paidAmount). */
  differenceAmount?: number
  /** Payment due date for the month (fixed day-of-month, PAYMENT_DUE_DAY). Past it = overdue. */
  dueDate: string
  approvedAt?: string
  paidAt?: string
}

/**
 * The mutable team dataset. Held in state by `TeamDataProvider`; every derivation
 * in this file is a pure function of this snapshot, so a single `setState`
 * recomputes the whole module's figures. `payoutsByMemberId` holds the period's
 * CANONICAL pay statements, mapped from the API by `team-payout-api-data.ts` — the
 * statement is no longer derived here.
 */
export type TeamDataSnapshot = {
  members: TeamMember[]
  /** The member↔client relationship, now mutable (assign/end live here). Soft-delete
   *  only — ended assignments stay so historical hours/productions remain attributable. */
  clientAssignments: ClientAssignment[]
  timeEntries: TimeEntry[]
  productions: ProductionEntry[]
  expenses: ExpenseEntry[]
  extras: ExtraWorkEntry[]
  tasks: MemberTask[]
  objectives: MemberObjective[]
  /** The month's real pay statements, keyed by member id. A member with no entry has
   *  no plan for the month — that is a state to render, not a zero to invent. */
  payoutsByMemberId: Record<string, MonthlyTeamStatement>
}

// ── Assignment derivations (snapshot-backed; reflect live assign/end) ─────────
export function assignmentsForMember(d: TeamDataSnapshot, memberId: string): ClientAssignment[] {
  return d.clientAssignments.filter((a) => a.teamMemberId === memberId)
}

/** Unique client names this member works for this month (active assignments only). */
export function clientsForMember(d: TeamDataSnapshot, memberId: string): string[] {
  const names = assignmentsForMember(d, memberId)
    .filter((a) => a.status !== 'ended')
    .map((a) => a.clientName)
  return Array.from(new Set(names))
}

/** Expected hours this month = sum of the member's active estimated monthly hours. */
export function expectedHoursForMember(d: TeamDataSnapshot, memberId: string): number {
  return assignmentsForMember(d, memberId)
    .filter((a) => a.status !== 'ended')
    .reduce((sum, a) => sum + (a.estimatedMonthlyHours ?? 0), 0)
}

// ── Client-scoped assignment derivations (the Clients carga / equipo views) ───
/** Assignments on a client; `activeOnly` drops ended ones (the default carga view). */
export function assignmentsForClient(
  d: TeamDataSnapshot,
  clientId: string,
  opts: { activeOnly?: boolean } = {},
): ClientAssignment[] {
  return d.clientAssignments.filter(
    (a) => a.clientId === clientId && (!opts.activeOnly || a.status !== 'ended'),
  )
}

/** The members actively assigned to a client (derived — replaces `assignedTeam`). */
export function membersForClient(d: TeamDataSnapshot, clientId: string): TeamMember[] {
  const ids = new Set(
    assignmentsForClient(d, clientId, { activeOnly: true }).map((a) => a.teamMemberId),
  )
  return d.members.filter((m) => ids.has(m.id))
}

/**
 * One member's monthly load on one client: tracked hours (logged time entries) and the
 * assignment's expected hours. Hours only — what the person costs the client is the
 * amount typed on the assignment (`monthlyCost`), not hours × an hourly rate: most of
 * the team is paid a fixed monthly amount and has no rate to multiply.
 */
export function memberMonthlyClientLoad(
  d: TeamDataSnapshot,
  memberId: string,
  clientId: string,
  month: string = currentTeamMonth(),
): { tracked: number; expected: number } {
  const tracked = timeEntriesForMember(d, memberId)
    .filter((e) => e.clientId === clientId && e.month === month)
    .reduce((sum, e) => sum + e.hours, 0)
  const assignment = d.clientAssignments.find(
    (a) => a.clientId === clientId && a.teamMemberId === memberId,
  )
  const expected = assignment?.estimatedMonthlyHours ?? 0
  return { tracked, expected }
}

export type ClientLoadRow = {
  /** The active assignment this row derives from — lets the Equipo tab end it. */
  assignmentId: string
  member: TeamMember
  roleOnClient: string
  tracked: number
  expected: number
  /** What the studio pays this person for this client per month — the assignment's
   *  "Le pagamos por este cliente". Absent when nobody entered it, or when the viewer
   *  may not see team cost (the API leaves it out). */
  monthlyCost?: number
}

/** Monthly workload breakdown for a client, one row per active member + totals. */
export function clientMonthlyLoad(
  d: TeamDataSnapshot,
  clientId: string,
  month: string = currentTeamMonth(),
): { rows: ClientLoadRow[]; totalHours: number; totalCost: number; missingCost: number } {
  const rows: ClientLoadRow[] = []
  for (const a of assignmentsForClient(d, clientId, { activeOnly: true })) {
    const member = memberById(d, a.teamMemberId)
    if (!member) continue
    const load = memberMonthlyClientLoad(d, a.teamMemberId, clientId, month)
    rows.push({
      assignmentId: a.id,
      member,
      roleOnClient: a.roleOnClient,
      tracked: load.tracked,
      expected: load.expected,
      ...(a.monthlyCost != null ? { monthlyCost: a.monthlyCost } : {}),
    })
  }
  const totalHours = rows.reduce((s, r) => s + r.tracked, 0)
  // The cost is what the studio PAYS, from the assignments. It used to be hourly rate ×
  // hours, which is why a fixed-fee person with no hours logged — Nati, at $250.000 for
  // a client — showed "—" on the very screen meant to show what the client costs.
  const totalCost = rows.reduce((s, r) => s + (r.monthlyCost ?? 0), 0)
  // How many people on the client have no amount entered. Summing them as zero would
  // print a real-looking total that quietly understates, so the count travels with it.
  const missingCost = rows.filter((r) => r.monthlyCost == null).length
  return { rows, totalHours, totalCost, missingCost }
}

// ── Snapshot-backed derivations (recompute live as entries mutate) ────────────
export function memberById(d: TeamDataSnapshot, memberId: string): TeamMember | undefined {
  return d.members.find((member) => member.id === memberId)
}

export function timeEntriesForMember(d: TeamDataSnapshot, memberId: string): TimeEntry[] {
  return d.timeEntries.filter((entry) => entry.teamMemberId === memberId)
}

export function productionsForMember(d: TeamDataSnapshot, memberId: string): ProductionEntry[] {
  return d.productions.filter((entry) => entry.teamMemberId === memberId)
}

export function expensesForMember(d: TeamDataSnapshot, memberId: string): ExpenseEntry[] {
  return d.expenses.filter((entry) => entry.teamMemberId === memberId)
}

export function extrasForMember(d: TeamDataSnapshot, memberId: string): ExtraWorkEntry[] {
  return d.extras.filter((entry) => entry.teamMemberId === memberId)
}

export function tasksForMember(d: TeamDataSnapshot, memberId: string): MemberTask[] {
  return d.tasks.filter((task) => task.teamMemberId === memberId)
}

export function objectivesForMember(d: TeamDataSnapshot, memberId: string): MemberObjective[] {
  return d.objectives.filter((objective) => objective.teamMemberId === memberId)
}

/** Full client record for an assignment's `clientId`. No client store is threaded into
 *  the team snapshot yet, so this returns undefined and the client-health preview falls
 *  back to the plain client name carried by the assignment. */
export function clientById(_clientId: string): Client | undefined {
  return undefined
}

// ── Activity feed (PRD §17 — unified chronological view) ──────────────────────
export type ActivityKind = 'task' | 'production' | 'expense' | 'extra'

/**
 * One normalized event in the member's activity timeline. Carries raw values
 * (hours/amount/status) — formatting (currency, badge, day label) happens at
 * render, per this module's "formatting only at render" contract.
 */
export type ActivityEvent = {
  id: string
  date: string
  kind: ActivityKind
  /** Headline of the event: task type, production type, viático concept, extra description. */
  title: string
  clientName: string
  hours?: number
  amount?: number
  /** Raw per-kind status (productions/viáticos/extras); tasks have none. */
  status?: ProductionStatus | ExpenseStatus | ExtraStatus
  isOutOfScope?: boolean
  loggedBy?: string
}

/**
 * Merges the member's tasks, productions, viáticos and extras into a single
 * timeline sorted newest first — the source for the Actividad tab. ISO dates
 * sort lexically, so a string compare yields chronological order.
 */
export function activityEventsForMember(d: TeamDataSnapshot, memberId: string): ActivityEvent[] {
  const tasks: ActivityEvent[] = timeEntriesForMember(d, memberId).map((e) => ({
    id: e.id,
    date: e.date,
    kind: 'task',
    title: e.taskType,
    clientName: e.clientName,
    hours: e.hours,
    isOutOfScope: e.isOutOfScope,
    loggedBy: e.loggedBy,
  }))
  const productions: ActivityEvent[] = productionsForMember(d, memberId).map((e) => ({
    id: e.id,
    date: e.date,
    kind: 'production',
    title: e.type,
    clientName: e.clientName,
    hours: e.hours,
    amount: e.amount,
    status: e.status,
    loggedBy: e.loggedBy,
  }))
  const expenses: ActivityEvent[] = expensesForMember(d, memberId).map((e) => ({
    id: e.id,
    date: e.date,
    kind: 'expense',
    title: e.concept,
    clientName: e.clientName ?? 'Sin cliente',
    amount: e.amount,
    status: e.status,
    loggedBy: e.loggedBy,
  }))
  const extras: ActivityEvent[] = extrasForMember(d, memberId).map((e) => ({
    id: e.id,
    date: e.date,
    kind: 'extra',
    title: e.description,
    clientName: e.clientName,
    hours: e.hours,
    amount: e.amount,
    status: e.status,
    loggedBy: e.loggedBy,
  }))
  return [...tasks, ...productions, ...expenses, ...extras].sort((a, b) => b.date.localeCompare(a.date))
}

/** Tracked hours this month = sum of the member's logged time entries (so
 *  "cargar horas" updates carga immediately). */
export function trackedHoursForMember(d: TeamDataSnapshot, memberId: string): number {
  return timeEntriesForMember(d, memberId).reduce((sum, entry) => sum + entry.hours, 0)
}

/** Tracked hours for a single client (the carga-por-cliente row). */
export function trackedHoursForMemberClient(
  d: TeamDataSnapshot,
  memberId: string,
  clientId: string,
): number {
  return timeEntriesForMember(d, memberId)
    .filter((entry) => entry.clientId === clientId)
    .reduce((sum, entry) => sum + entry.hours, 0)
}

/** Load ratio (PRD §18): tracked / expected. `undefined` when no objective. */
export function loadRatioForMember(d: TeamDataSnapshot, memberId: string): number | undefined {
  const expected = expectedHoursForMember(d, memberId)
  if (expected <= 0) return undefined
  return trackedHoursForMember(d, memberId) / expected
}

/** Load band from a ratio (PRD §5.3 thresholds). */
export function loadStatusFromRatio(ratio: number | undefined): LoadStatus | undefined {
  if (ratio === undefined) return undefined
  if (ratio > 1) return 'overloaded'
  if (ratio >= 0.86) return 'high'
  if (ratio >= 0.6) return 'normal'
  return 'low'
}

export function loadStatusForMember(d: TeamDataSnapshot, memberId: string): LoadStatus | undefined {
  return loadStatusFromRatio(loadRatioForMember(d, memberId))
}

export function productionsCountForMember(d: TeamDataSnapshot, memberId: string): number {
  return productionsForMember(d, memberId).length
}

export function expensesTotalForMember(d: TeamDataSnapshot, memberId: string): number {
  return expensesForMember(d, memberId).reduce((sum, expense) => sum + expense.amount, 0)
}

/**
 * The member's monthly statement — now a LOOKUP into the period's canonical payout
 * rows, not a derivation.
 *
 * It used to compute the total from mock productions/viáticos/extras and invent the
 * partial payment from a hash of the member id (`0.50–0.79` of the total), which
 * meant every figure on the Pagos surface was fabricated and every lifecycle
 * transition died in memory. The rows now come from `PayoutStatement` via
 * `team-payout-api-data.ts`.
 *
 * `undefined` means the member has NO plan for the month. That is a real state the
 * UI must render ("Sin plan del mes" → `/operacion-mensual`, where the plan is
 * created); it must never fall back to a synthesized total, which is the exact
 * failure this replaced.
 */
export function statementForMember(d: TeamDataSnapshot, memberId: string): MonthlyTeamStatement | undefined {
  if (!memberById(d, memberId)) return undefined
  return d.payoutsByMemberId[memberId]
}

/** Estimated monthly pay (statement total) — the table's "Pago estimado". */
export function estimatedPayForMember(d: TeamDataSnapshot, memberId: string): number {
  return statementForMember(d, memberId)?.totalAmount ?? 0
}

// ── Payment history (Últimos pagos) ──────────────────────────────────────────
export type TeamPaymentRecord = {
  id: string
  iso: string
  amount: number
  method: string
  status: TeamPaymentStatus
}


/**
 * Recent salary/honorarios payments to this member (newest first). There is no
 * real payment-history ledger endpoint yet, so this returns an empty history and
 * the "Últimos pagos" card renders its honest empty state — no synthesized rows.
 */
export function paymentHistoryForMember(
  _d: TeamDataSnapshot,
  _memberId: string,
): TeamPaymentRecord[] {
  return []
}

// ── Bank-data completeness (PRD §8.3) — pure, member-level ────────────────────
export type BankCompleteness = 'complete' | 'incomplete' | 'none'

/** Complete = holder + CBU/CVU present; incomplete = some data but missing one
 *  of those; none = no bank record at all. An API-loaded member carries only the derived
 *  `bankStatus` (the fields are capability-gated), so that wins over `bank`. */
export function bankCompleteness(member: TeamMember): BankCompleteness {
  return member.bankStatus ?? bankDetailsCompleteness(member.bank)
}

/** The same rule over the fields themselves, for mock data and a just-saved form. */
export function bankDetailsCompleteness(bank: TeamMember['bank']): BankCompleteness {
  if (!bank || Object.values(bank).every((value) => !value)) return 'none'
  if (bank.accountHolder && bank.cbuOrCvu) return 'complete'
  return 'incomplete'
}

// ── Pending extras (PRD §5.5 Extras / fuera de scope) ────────────────────────
export type PendingExtras = { count: number; amount: number }

/** Extras still awaiting approval/payment — what the table's Extras cell flags. */
export function pendingExtrasForMember(d: TeamDataSnapshot, memberId: string): PendingExtras {
  const pending = extrasForMember(d, memberId).filter((extra) => extra.status === 'pending')
  return {
    count: pending.length,
    amount: pending.reduce((sum, extra) => sum + extra.amount, 0),
  }
}

/** Most recent activity/edit date for the member (PRD §5.10 Última actualización). */
export function lastUpdatedForMember(d: TeamDataSnapshot, memberId: string): string {
  const dates = [
    ...timeEntriesForMember(d, memberId).map((entry) => entry.date),
    ...productionsForMember(d, memberId).map((entry) => entry.date),
    ...expensesForMember(d, memberId).map((entry) => entry.date),
    ...extrasForMember(d, memberId).map((entry) => entry.date),
  ].filter(Boolean)
  if (dates.length === 0) return `${currentTeamMonth()}-01`
  return dates.sort((a, b) => b.localeCompare(a))[0]
}

// `nextPaymentStatus` was deleted with the local lifecycle: the next state is no
// longer this module's to decide. Each transition is a conditional server update
// filtered on the status it expects to move FROM (`src/api/payouts.ts`), so the row
// that comes back IS the next state — guessing it locally is how an out-of-order
// call ended up looking like it had succeeded.
