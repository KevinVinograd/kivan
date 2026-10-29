import { useQuery } from '@tanstack/react-query'

import { reportsApi } from '@/api/reports'
import { queryKeys } from '@/queries/keys'

function fromMinor(minor: string): number {
  return Number(minor) / 100
}

export interface LiveSummaryMoney {
  ingresos: number
  egresos: number
  rentabilidad: number
  otherLaneCount: number
}

export interface LiveReportsSummary {
  money: LiveSummaryMoney | null
  isLoading: boolean
  isError: boolean
}

export function useReportsSummary(period: string, enabled: boolean): LiveReportsSummary {
  const query = useQuery({
    queryKey: queryKeys.reports.summary(period),
    queryFn: () => reportsApi.summary(period),
    enabled,
  })

  const dto = query.data
  let money: LiveSummaryMoney | null = null
  if (dto) {
    const ingresos = fromMinor(dto.revenue.billedMinor)
    const egresos = fromMinor(dto.payments.totalMinor) + fromMinor(dto.payouts.totalMinor)
    const otherLaneCount = dto.revenue.otherLaneCount + dto.payments.otherLaneCount
    money = { ingresos, egresos, rentabilidad: ingresos - egresos, otherLaneCount }
  }

  return { money, isLoading: query.isLoading, isError: query.isError }
}
