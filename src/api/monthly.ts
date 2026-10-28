/** Monthly-operation resource calls — bundle read + plan sub-resource writes. */
import { z } from 'zod'
import { apiClient } from './client'
import type { ReceivableDto } from './receivables'
import type { PayoutStatementDto } from './payouts'

/**
 * What the SERVER refuses to close on. Distinct from the front's own validations
 * (`monthly-operation-format.ts` → `closeBlockers`): the two lists are computed from
 * different data and neither is a superset of the other, so a month can look ready
 * here and still be refused there. `code` is open-ended on purpose — an unknown code
 * must still be shown rather than dropped, or the UI goes back to promising a close
 * the server rejects.
 */
export const CloseBlockerSchema = z.object({
  code: z.string(),
  message: z.string(),
  count: z.number(),
})
export const CloseBlockersSchema = z.array(CloseBlockerSchema)
export type CloseBlockerDto = z.infer<typeof CloseBlockerSchema>

/** Who worked a production, and for how many hours. `hours` is null when the split was
 *  never recorded (never 0 — absence is information, see migration 0012). */
export interface ProductionAttributionDto {
  teamMemberId: string
  name: string
  hours: number | null
  role: string
}

export interface ProductionDto {
  id: string
  period: string
  date: string
  clientId: string | null
  clientName: string | null
  title: string
  type: string
  responsible: string | null
  participants: string[]
  hours: number
  viaticsMinor: string
  /** null for a communication lead: the API never hands them pay. */
  totalCostMinor: string | null
  billable: string | null
  billAmountMinor: string | null
  /** Hours its per-hour line's included hours covered that month; the bill is the rest.
   *  Optional for deploy skew. */
  packHours?: number
  status: string
  notes: string | null
  /** The client's per-production service it is billed under. Optional for deploy skew. */
  clientServiceId?: string | null
  /** The cobro that billed it; set means locked. Optional for deploy skew. */
  receivableId?: string | null
  /** Who coordinated it (the planilla's "Account Manager"). Optional for deploy skew. */
  accountManagerId?: string | null
  accountManagerName?: string | null
  /** YYYY-MM-DD the viático was paid back; null while owed. Optional for deploy skew. */
  viaticsPaidAt?: string | null
  /** Drive link or file name of the viático receipt. Optional for deploy skew. */
  receipt?: string | null
  attribution: ProductionAttributionDto[]
  version: number
}

export interface ExpenseDto {
  id: string
  period: string
  concept: string
  category: string
  amountMinor: string
  recurrence: string
  responsible: string | null
  monotributo: string | null
  payStatus: string
  affectsProfitability: boolean
  notes: string | null
  version: number
}

export interface AlertDto {
  id: string
  period: string
  severity: string
  type: string
  entity: string
  description: string
  responsible: string | null
  status: string
  version: number
}

export interface MonotributoWatchDto {
  code: string
  label: string
  annualBilledMinor: string
  annualLimitMinor: string | null
}

export interface PlanMemberDto {
  id: string
  name: string
  role: string
}

export interface PlanBundleDto {
  period: string
  status: string
  checklist: Record<string, boolean>
  /** The month has more rows than one page carries, so every figure here is a SUBSET.
   *  Optional for the deploy-skew window: an older API sends nothing, which reads as
   *  "not truncated" — the same answer it has always given, rather than a new blocker
   *  appearing for every month the moment the browser updates. */
  truncated?: boolean
  receivables: ReceivableDto[]
  payouts: PayoutStatementDto[]
  productions: ProductionDto[]
  expenses: ExpenseDto[]
  alerts: AlertDto[]
  monotributo: MonotributoWatchDto[]
  members: PlanMemberDto[]
  /**
   * The month's outflows, from the Pagos module. `paymentTotals` is an EXACT aggregate and
   * is the ONLY thing money may be derived from; `payments` is a capped list for display and
   * can be shorter than the totals' `count`.
   *
   * Optional for the deploy-skew window: an older API sends neither, which reads as a month
   * with no outflows, exactly what the screen showed before this existed.
   */
  paymentTotals?: PaymentTotalDto[]
  teamPaymentTotals?: TeamPaymentTotalDto[]
  payments?: PlanPaymentDto[]
  /** Pagos of the period outside the peso lane, which every figure above excludes.
   *  Optional for the deploy window, like the three above it. */
  otherLanePaymentCount?: number
}

/** One recipient type's registered outflow for the month. Money in MINOR units. */
export interface PaymentTotalDto {
  recipientType: string
  /** Committed: recorded as owed, whether or not it has been paid yet. */
  totalMinor: string
  /** Settled: the part actually paid out. */
  paidMinor: string
  count: number
}

/**
 * One member payroll payments for the month, keyed by the person.
 *
 * Payroll has TWO overlapping records — the PayoutStatement (the plan) and the payments in
 * /pagos (the actuals) — and adding them charges a colaboradora twice against the month
 * profit. The front takes one per member, so it needs the member key.
 */
export interface TeamPaymentTotalDto {
  teamMemberId: string | null
  totalMinor: string
  paidMinor: string
}

/** One outflow row, for the read-only Gastos list. Never a money source. */
export interface PlanPaymentDto {
  id: string
  recipientType: string
  recipientName: string
  concept: string
  totalMinor: string
  paidMinor: string
  status: string
  expectedDate: string | null
  paymentDate: string | null
}

export interface CreateProductionInput {
  date: string
  clientId?: string | null
  clientName?: string | null
  title: string
  type: string
  responsible?: string
  participants?: string[]
  hours?: number
  viaticsMinor?: string
  totalCostMinor?: string
  billable?: string | null
  billAmountMinor?: string
  status?: string
  notes?: string
  /** Pin the production to the people who worked it. Supplying this is what makes the
   *  hours attributable (and what lets the team surface find a member's productions). */
  attribution?: { teamMemberId: string; hours?: number | null; role: 'responsible' | 'participant' }[]
  accountManagerId?: string | null
  viaticsPaidAt?: string | null
  receipt?: string | null
}

export interface CreateExpenseInput {
  concept: string
  category?: string
  amountMinor?: string
  recurrence?: string
  responsible?: string
  monotributo?: string
  payStatus?: string
  affectsProfitability?: boolean
  notes?: string
}

export interface CreateAlertInput {
  severity: string
  type: string
  entity: string
  description: string
  responsible?: string
  status?: string
}

export const monthlyApi = {
  getBundle: (period: string) => apiClient.get<PlanBundleDto>(`/months/${period}/plan`),
  getCloseBlockers: (period: string) =>
    apiClient.get<CloseBlockerDto[]>(`/months/${period}/close-blockers`, { schema: CloseBlockersSchema }),
  close: (period: string) => apiClient.post<{ status: string }>(`/months/${period}/close`, {}),
  reopen: (period: string) => apiClient.post<{ status: string }>(`/months/${period}/reopen`, {}),
  setChecklist: (period: string, item: string, value: boolean) =>
    apiClient.put<Record<string, boolean>>(`/months/${period}/checklist`, { item, value }),

  createProduction: (period: string, input: CreateProductionInput) =>
    apiClient.post<ProductionDto>(`/months/${period}/productions`, input),
  updateProduction: (id: string, input: Partial<CreateProductionInput> & { version: number }) =>
    apiClient.put<ProductionDto>(`/productions/${id}`, input),
  deleteProduction: (id: string, version: number) =>
    apiClient.delete<{ deleted: boolean }>(`/productions/${id}`, { params: { version } }),
  /** Approve productions (only approved ones are billed and paid) or send them back. */
  setProductionApproval: (ids: string[], approved: boolean) =>
    apiClient.post<{ updated: number }>('/productions/approval', { ids, approved }),
  /** Who a production can name (id + name only) — the roster a lead may pick from. */
  listProductionPeople: () => apiClient.get<{ id: string; name: string }[]>('/productions/people'),
  /** One client's productions over the last six months, newest first. */
  listClientProductions: (clientId: string) =>
    apiClient.get<ProductionDto[]>(`/clients/${clientId}/productions`),
  /** Mark viáticos paid back on `paidAt` (YYYY-MM-DD), or owed again with null. */
  markViaticsPaid: (ids: string[], paidAt: string | null) =>
    apiClient.post<{ updated: number }>('/productions/viatics-paid', { ids, paidAt }),

  createExpense: (period: string, input: CreateExpenseInput) =>
    apiClient.post<ExpenseDto>(`/months/${period}/expenses`, input),
  updateExpense: (id: string, input: Partial<CreateExpenseInput> & { version: number }) =>
    apiClient.put<ExpenseDto>(`/expenses/${id}`, input),
  deleteExpense: (id: string, version: number) =>
    apiClient.delete<{ deleted: boolean }>(`/expenses/${id}`, { params: { version } }),

  createAlert: (period: string, input: CreateAlertInput) =>
    apiClient.post<AlertDto>(`/months/${period}/alerts`, input),
  updateAlert: (id: string, input: Partial<CreateAlertInput> & { version: number }) =>
    apiClient.put<AlertDto>(`/alerts/${id}`, input),
  deleteAlert: (id: string, version: number) =>
    apiClient.delete<{ deleted: boolean }>(`/alerts/${id}`, { params: { version } }),
}
