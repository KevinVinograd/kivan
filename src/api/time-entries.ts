/** Time entries (Cargar horas) — thin typed wrappers over the api client. */
import { z } from 'zod'

import { apiClient } from './client'

export const TimeEntrySchema = z.object({
  id: z.string(),
  teamMemberId: z.string(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  taskType: z.string(),
  date: z.string(), // YYYY-MM-DD
  month: z.string(), // YYYY-MM
  hours: z.number(),
  description: z.string().nullable(),
  isOutOfScope: z.boolean(),
  loggedByUserId: z.string().nullable(),
})
export type TimeEntryDto = z.infer<typeof TimeEntrySchema>

export const TimeEntriesSchema = z.array(TimeEntrySchema)

/** `POST /team-members/:id/time-entries` body. */
export interface CreateTimeEntryInput {
  clientId?: string
  clientName?: string
  taskType?: string
  date: string
  hours: number
  description?: string
  isOutOfScope?: boolean
}

export const timeEntriesApi = {
  list: (params?: { period?: string; teamMemberId?: string }) =>
    apiClient.get<TimeEntryDto[]>('/time-entries', {
      schema: TimeEntriesSchema,
      ...(params ? { params } : {}),
    }),
  create: (teamMemberId: string, input: CreateTimeEntryInput) =>
    apiClient.post<TimeEntryDto>(`/team-members/${teamMemberId}/time-entries`, input, {
      schema: TimeEntrySchema,
    }),
}
