import { z } from 'zod'
import { apiClient } from './client'

export const MemberExpenseSchema = z.object({
  id: z.string(),
  teamMemberId: z.string(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  date: z.string(),
  concept: z.string(),
  amountMinor: z.string(),
  status: z.string(),
  notes: z.string().nullable(),
  loggedByUserId: z.string().nullable(),
})
export type MemberExpenseDto = z.infer<typeof MemberExpenseSchema>
export const MemberExpensesSchema = z.array(MemberExpenseSchema)

export const MemberExtraSchema = z.object({
  id: z.string(),
  teamMemberId: z.string(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  date: z.string(),
  description: z.string(),
  hours: z.number().nullable(),
  amountMinor: z.string(),
  status: z.string(),
  approvedByUserId: z.string().nullable(),
  loggedByUserId: z.string().nullable(),
})
export type MemberExtraDto = z.infer<typeof MemberExtraSchema>
export const MemberExtrasSchema = z.array(MemberExtraSchema)

const ApproveResultSchema = z.object({ approved: z.number() })

export interface CreateMemberExpenseBody {
  teamMemberId: string
  clientId?: string
  clientName?: string
  date: string
  concept: string
  amountMinor: string
  notes?: string
}
export interface CreateMemberExtraBody {
  teamMemberId: string
  clientId?: string
  clientName?: string
  date: string
  description: string
  hours?: number
  amountMinor: string
}

export const memberActivityApi = {
  listExpenses: (teamMemberId?: string) =>
    apiClient.get<MemberExpenseDto[]>('/member-expenses', {
      ...(teamMemberId ? { params: { teamMemberId } } : {}),
      schema: MemberExpensesSchema,
    }),
  createExpense: (body: CreateMemberExpenseBody) =>
    apiClient.post<MemberExpenseDto>('/member-expenses', body, { schema: MemberExpenseSchema }),
  listExtras: (teamMemberId?: string) =>
    apiClient.get<MemberExtraDto[]>('/member-extras', {
      ...(teamMemberId ? { params: { teamMemberId } } : {}),
      schema: MemberExtrasSchema,
    }),
  createExtra: (body: CreateMemberExtraBody) =>
    apiClient.post<MemberExtraDto>('/member-extras', body, { schema: MemberExtraSchema }),
  approveExtras: (teamMemberId: string) =>
    apiClient.post<{ approved: number }>(
      '/member-extras/approve',
      { teamMemberId },
      { schema: ApproveResultSchema },
    ),
}
