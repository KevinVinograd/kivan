/** Edge validation (Zod) + DTOs for Time Entries (Cargar horas). */
import { z } from 'zod';

export const createTimeEntrySchema = z.object({
  clientId: z.uuid().optional(),
  clientName: z.string().trim().max(200).optional(),
  taskType: z.string().trim().min(1).max(80).default('general'),
  date: z.coerce.date(),
  hours: z.number().positive().max(24),
  description: z.string().trim().max(2000).optional(),
  isOutOfScope: z.boolean().default(false),
});
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;

export const listTimeEntriesQuerySchema = z.object({
  // 'YYYY-MM' → only that month's entries; omitted → all.
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be YYYY-MM').optional(),
  teamMemberId: z.uuid().optional(),
});
export type ListTimeEntriesQuery = z.infer<typeof listTimeEntriesQuerySchema>;

export const timeEntryIdParamSchema = z.object({ id: z.uuid() });

export interface TimeEntryDto {
  id: string;
  teamMemberId: string;
  clientId: string | null;
  clientName: string | null;
  taskType: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  hours: number;
  description: string | null;
  isOutOfScope: boolean;
  loggedByUserId: string | null;
}

interface TimeEntryRecord {
  id: string;
  teamMemberId: string;
  clientId: string | null;
  clientName: string | null;
  taskType: string;
  date: Date;
  hours: number;
  description: string | null;
  isOutOfScope: boolean;
  loggedByUserId: string | null;
}

export function toTimeEntryDto(r: TimeEntryRecord): TimeEntryDto {
  const date = r.date.toISOString().slice(0, 10);
  return {
    id: r.id,
    teamMemberId: r.teamMemberId,
    clientId: r.clientId,
    clientName: r.clientName,
    taskType: r.taskType,
    date,
    month: date.slice(0, 7),
    hours: r.hours,
    description: r.description,
    isOutOfScope: r.isOutOfScope,
    loggedByUserId: r.loggedByUserId,
  };
}
