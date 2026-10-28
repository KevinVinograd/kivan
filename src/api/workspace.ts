/** Workspace settings resource — thin typed wrappers over the api client.
 *  `GET /workspace` / `PUT /workspace` are owner/admin-only (manager guard). */
import { z } from 'zod'

import { apiClient } from './client'

/** Monthly-operation rules, mirroring the server's `monthlyRulesSchema`. Null on the
 *  workspace means never configured; the front falls back to its defaults. */
export const MonthlyRulesSchema = z.object({
  closeDay: z.number(),
  closeReminder: z.boolean(),
  reminderDays: z.number(),
  autoReminders: z.boolean(),
  payDay: z.number(),
  requireApproval: z.boolean(),
  expenseCategories: z.array(z.string()),
  productionTypes: z.array(z.string()),
})
export type MonthlyRules = z.infer<typeof MonthlyRulesSchema>

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  timezone: z.string(),
  defaultCurrency: z.string(),
  fiscalLegalName: z.string().nullable(),
  fiscalTaxId: z.string().nullable(),
  monotributoCategory: z.string().nullable(),
  /** Cashflow position anchor as a date-only string (YYYY-MM-DD), or null if unset. */
  positionAsOf: z.string().nullable(),
  monthlyRules: MonthlyRulesSchema.nullable(),
})
export type WorkspaceDto = z.infer<typeof WorkspaceSchema>

/** `PUT /workspace` body — every field optional; send only what changes. */
export type UpdateWorkspaceInput = Partial<Omit<WorkspaceDto, 'id'>>

export const workspaceApi = {
  get: () => apiClient.get<WorkspaceDto>('/workspace', { schema: WorkspaceSchema }),
  update: (input: UpdateWorkspaceInput) =>
    apiClient.put<WorkspaceDto>('/workspace', input, { schema: WorkspaceSchema }),
}
