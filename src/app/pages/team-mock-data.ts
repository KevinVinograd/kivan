import { currentPeriod, toMonthId } from '@/app/lib/periods'
import type { Client, ClientAssignment, TeamMember } from './clients-mock-data'

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

export function currentTeamMonth(): string {
  return toMonthId(currentPeriod())
}

export const PAYMENT_DUE_DAY = 10

export type TeamPaymentStatus =
  | 'pending'
  | 'review'
  | 'approved'
  | 'processing'
  | 'paid'
  | 'with_difference'
export type LoadStatus = 'low' | 'normal' | 'high' | 'overloaded'
export type ProductionStatus = 'pending' | 'review' | 'approved' | 'paid'
export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'paid'
export type ExtraStatus = 'pending' | 'approved' | 'rejected' | 'paid'

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
  loggedBy?: string
}

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
  loggedBy?: string
}

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'overdue'

export type MemberTask = {
  id: string
  teamMemberId: string
  clientId?: string
  clientName?: string
  title: string
  dueDate: string
  status: TaskStatus
}

export type ObjectiveStatus = 'on_track' | 'at_risk' | 'completed' | 'overdue'

export type MemberObjective = {
  id: string
  teamMemberId: string
  clientName?: string
  title: string
  progress: number
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
  paidAmount?: number
  differenceAmount?: number
  dueDate: string
  approvedAt?: string
  paidAt?: string
}

export type TeamDataSnapshot = {
  members: TeamMember[]
  clientAssignments: ClientAssignment[]
  timeEntries: TimeEntry[]
  productions: ProductionEntry[]
  expenses: ExpenseEntry[]
  extras: ExtraWorkEntry[]
  tasks: MemberTask[]
  objectives: MemberObjective[]
  payoutsByMemberId: Record<string, MonthlyTeamStatement>
}

export function assignmentsForMember(d: TeamDataSnapshot, memberId: string): ClientAssignment[] {
  return d.clientAssignments.filter((a) => a.teamMemberId === memberId)
}

export function clientsForMember(d: TeamDataSnapshot, memberId: string): string[] {
  const names = assignmentsForMember(d, memberId)
    .filter((a) => a.status !== 'ended')
    .map((a) => a.clientName)
  return Array.from(new Set(names))
}

export function expectedHoursForMember(d: TeamDataSnapshot, memberId: string): number {
  return assignmentsForMember(d, memberId)
    .filter((a) => a.status !== 'ended')
    .reduce((sum, a) => sum + (a.estimatedMonthlyHours ?? 0), 0)
}

export function assignmentsForClient(
  d: TeamDataSnapshot,
  clientId: string,
  opts: { activeOnly?: boolean } = {},
): ClientAssignment[] {
  return d.clientAssignments.filter(
    (a) => a.clientId === clientId && (!opts.activeOnly || a.status !== 'ended'),
  )
}

export function membersForClient(d: TeamDataSnapshot, clientId: string): TeamMember[] {
  const ids = new Set(
    assignmentsForClient(d, clientId, { activeOnly: true }).map((a) => a.teamMemberId),
  )
  return d.members.filter((m) => ids.has(m.id))
}

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
  assignmentId: string
  member: TeamMember
  roleOnClient: string
  tracked: number
  expected: number
  monthlyCost?: number
}

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
  const totalCost = rows.reduce((s, r) => s + (r.monthlyCost ?? 0), 0)
  const missingCost = rows.filter((r) => r.monthlyCost == null).length
  return { rows, totalHours, totalCost, missingCost }
}

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

export function clientById(_clientId: string): Client | undefined {
  return undefined
}

export type ActivityKind = 'task' | 'production' | 'expense' | 'extra'

export type ActivityEvent = {
  id: string
  date: string
  kind: ActivityKind
  title: string
  clientName: string
  hours?: number
  amount?: number
  status?: ProductionStatus | ExpenseStatus | ExtraStatus
  isOutOfScope?: boolean
  loggedBy?: string
}

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

export function trackedHoursForMember(d: TeamDataSnapshot, memberId: string): number {
  return timeEntriesForMember(d, memberId).reduce((sum, entry) => sum + entry.hours, 0)
}

export function trackedHoursForMemberClient(
  d: TeamDataSnapshot,
  memberId: string,
  clientId: string,
): number {
  return timeEntriesForMember(d, memberId)
    .filter((entry) => entry.clientId === clientId)
    .reduce((sum, entry) => sum + entry.hours, 0)
}

export function loadRatioForMember(d: TeamDataSnapshot, memberId: string): number | undefined {
  const expected = expectedHoursForMember(d, memberId)
  if (expected <= 0) return undefined
  return trackedHoursForMember(d, memberId) / expected
}

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

export function statementForMember(d: TeamDataSnapshot, memberId: string): MonthlyTeamStatement | undefined {
  if (!memberById(d, memberId)) return undefined
  return d.payoutsByMemberId[memberId]
}

export function estimatedPayForMember(d: TeamDataSnapshot, memberId: string): number {
  return statementForMember(d, memberId)?.totalAmount ?? 0
}

export type TeamPaymentRecord = {
  id: string
  iso: string
  amount: number
  method: string
  status: TeamPaymentStatus
}


export function paymentHistoryForMember(
  _d: TeamDataSnapshot,
  _memberId: string,
): TeamPaymentRecord[] {
  return []
}

export type BankCompleteness = 'complete' | 'incomplete' | 'none'

export function bankCompleteness(member: TeamMember): BankCompleteness {
  return member.bankStatus ?? bankDetailsCompleteness(member.bank)
}

export function bankDetailsCompleteness(bank: TeamMember['bank']): BankCompleteness {
  if (!bank || Object.values(bank).every((value) => !value)) return 'none'
  if (bank.accountHolder && bank.cbuOrCvu) return 'complete'
  return 'incomplete'
}

export type PendingExtras = { count: number; amount: number }

export function pendingExtrasForMember(d: TeamDataSnapshot, memberId: string): PendingExtras {
  const pending = extrasForMember(d, memberId).filter((extra) => extra.status === 'pending')
  return {
    count: pending.length,
    amount: pending.reduce((sum, extra) => sum + extra.amount, 0),
  }
}

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

