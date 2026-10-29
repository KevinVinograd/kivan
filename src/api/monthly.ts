import { z } from 'zod'
import { apiClient } from './client'
import type { ReceivableDto } from './receivables'
import type { PayoutStatementDto } from './payouts'

export const CloseBlockerSchema = z.object({
  code: z.string(),
  message: z.string(),
  count: z.number(),
})
export const CloseBlockersSchema = z.array(CloseBlockerSchema)
export type CloseBlockerDto = z.infer<typeof CloseBlockerSchema>

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
  totalCostMinor: string | null
  billable: string | null
  billAmountMinor: string | null
  packHours?: number
  status: string
  notes: string | null
  clientServiceId?: string | null
  receivableId?: string | null
  accountManagerId?: string | null
  accountManagerName?: string | null
  viaticsPaidAt?: string | null
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
  truncated?: boolean
  receivables: ReceivableDto[]
  payouts: PayoutStatementDto[]
  productions: ProductionDto[]
  expenses: ExpenseDto[]
  alerts: AlertDto[]
  monotributo: MonotributoWatchDto[]
  members: PlanMemberDto[]
  paymentTotals?: PaymentTotalDto[]
  teamPaymentTotals?: TeamPaymentTotalDto[]
  payments?: PlanPaymentDto[]
  otherLanePaymentCount?: number
}

export interface PaymentTotalDto {
  recipientType: string
  totalMinor: string
  paidMinor: string
  count: number
}

export interface TeamPaymentTotalDto {
  teamMemberId: string | null
  totalMinor: string
  paidMinor: string
}

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
  setProductionApproval: (ids: string[], approved: boolean) =>
    apiClient.post<{ updated: number }>('/productions/approval', { ids, approved }),
  listProductionPeople: () => apiClient.get<{ id: string; name: string }[]>('/productions/people'),
  listClientProductions: (clientId: string) =>
    apiClient.get<ProductionDto[]>(`/clients/${clientId}/productions`),
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
