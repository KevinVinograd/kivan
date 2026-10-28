import { useQuery } from '@tanstack/react-query'

import { reportsApi } from '@/api/reports'
import { queryKeys } from '@/queries/keys'

/** Minor units (integer cents, serialized as a string) → major units (pesos). */
function fromMinor(minor: string): number {
  return Number(minor) / 100
}

/** The money figures the Resumen KPI band shows, sourced from `/reports/summary`. */
export interface LiveSummaryMoney {
  ingresos: number
  egresos: number
  rentabilidad: number
  /** Rows of the period the three figures above left out for being in another lane. The
   *  band names the count, because a peso total that silently omits money is the exact
   *  failure this scoping exists to prevent. */
  otherLaneCount: number
}

export interface LiveReportsSummary {
  money: LiveSummaryMoney | null
  isLoading: boolean
  isError: boolean
}

/**
 * Live Resumen summary from `GET /reports/summary` for the given period. Maps the
 * canonical backend aggregate to the three money KPIs the Resumen band shows:
 * `ingresos` = revenue billed, `egresos` = payments + payouts totals, and
 * `rentabilidad` = `ingresos - egresos` (consistent with the mock definition it
 * replaces). Gated by `enabled` (capability-gated, since the Resumen money tiles are
 * owner-scoped in the UI); the operational KPIs stay mock-derived.
 */
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
