import { useQuery } from '@tanstack/react-query'

import { workspaceApi, type MonthlyRules } from '@/api/workspace'
import { queryKeys } from '@/queries/keys'

export const DEFAULT_MONTHLY_RULES: MonthlyRules = {
  closeDay: 28,
  closeReminder: true,
  reminderDays: 3,
  autoReminders: true,
  payDay: 5,
  requireApproval: true,
  expenseCategories: ['Software', 'Viáticos', 'Honorarios', 'Impuestos'],
  productionTypes: ['Producción mensual', 'Producción extra', 'Evento'],
}

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
