import { useQuery } from '@tanstack/react-query'

import { workspaceApi, type MonthlyRules } from '@/api/workspace'
import { queryKeys } from '@/queries/keys'

/**
 * The studio's monthly-operation rules (Configuración → Operación mensual), persisted on
 * the workspace. Read here by BOTH the settings section that edits them and the pickers
 * that consume the vocabularies, so the two can never disagree about what the studio
 * configured.
 *
 * `null` from the API means "never configured" — the workspace predates the section, or
 * nobody has saved yet — and reads as these defaults. They are the same values the
 * section shipped with, so nothing changes for a studio that never touches it.
 */
export const DEFAULT_MONTHLY_RULES: MonthlyRules = {
  closeDay: 28,
  closeReminder: true,
  reminderDays: 3,
  autoReminders: true,
  payDay: 5,
  requireApproval: true,
  expenseCategories: ['Software', 'Viáticos', 'Honorarios', 'Impuestos'],
  // HOLD's own words from its production planilla (2026-10): the monthly content shoot,
  // the extra one billed apart, and event coverage.
  productionTypes: ['Producción mensual', 'Producción extra', 'Evento'],
}

/**
 * The rules in force. Falls back to the defaults while loading, on error, and when the
 * workspace has none — a picker must always have something to offer, and an empty list
 * would read as "this studio has no categories" rather than "we could not load them".
 */
export function useMonthlyRules(): {
  rules: MonthlyRules
  isLoading: boolean
  isError: boolean
} {
  const query = useQuery({
    queryKey: queryKeys.workspace.current,
    queryFn: workspaceApi.get,
    staleTime: 60_000,
  })
  return {
    rules: query.data?.monthlyRules ?? DEFAULT_MONTHLY_RULES,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
