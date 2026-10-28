/**
 * Report aggregates backed by TanStack Query. `profitability` (per-client six-area
 * cost + margin) and `capacity` (per-member real cost) are CAPABILITY-GATED, so
 * the queries only run when `enabled` (the caller passes the matching
 * `can(role, …)`) — a role without the capability never fires a request that would
 * 403. The hooks return the mapped report items directly, so the page assembles the
 * dataset from real, typed figures.
 */
import { useQuery } from '@tanstack/react-query'

import { reportsApi } from '@/api/reports'
import { queryKeys } from '@/queries/keys'
import { mapApiCapacity, mapApiMarginHistory, mapApiProfitability } from './reports-data'
import type {
  ClientProfitabilityReportItem,
  MarginHistoryPoint,
  ProductivityReportItem,
  TeamCapacityReportItem,
} from './reports-types'

/** Per-client profitability for a period (needs `profitability`). Empty until enabled/loaded. */
export function useReportsProfitability(
  period: string,
  enabled: boolean,
): {
  data: ClientProfitabilityReportItem[]
  /** Clients billed only in another lane, so absent from `data` altogether. */
  otherLaneClientCount: number
  /** What clients with no peso cobro in the period cost (pesos), and how many: no row either. */
  unbilledCost: { clientCount: number; cost: number }
  isLoading: boolean
  isError: boolean
  refetch: () => void
} {
  const query = useQuery({
    queryKey: queryKeys.reports.profitability(period),
    queryFn: () => reportsApi.profitability(period),
    enabled,
    staleTime: 60_000,
  })
  return {
    data: query.data ? mapApiProfitability(query.data.byClient) : [],
    otherLaneClientCount: query.data?.otherLaneClientCount ?? 0,
    unbilledCost: {
      clientCount: query.data?.unbilledCost.clientCount ?? 0,
      cost: Number(query.data?.unbilledCost.costMinor ?? '0') / 100,
    },
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}

/** Per-task productivity for a period (owner+admin; hours, not money). Empty until enabled/loaded. */
export function useReportsProductivity(
  period: string,
  enabled: boolean,
): { data: ProductivityReportItem[]; isLoading: boolean; isError: boolean; refetch: () => void } {
  const query = useQuery({
    queryKey: queryKeys.reports.productivity(period),
    queryFn: () => reportsApi.productivity(period),
    enabled,
    staleTime: 60_000,
  })
  return {
    // No mapper: the productivity DTO is already hours-shaped and field-for-field the report
    // item (no minor-unit conversion to undo), so a mapper here was a rename of nothing.
    data: query.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}

/** Margin trend, last 6 months (needs `profitability`; period-agnostic). Studio-wide,
 *  or ONE client's when `clientId` is given (the Cliente drawer's trend). */
export function useReportsMarginHistory(
  enabled: boolean,
  clientId?: string,
): { data: MarginHistoryPoint[]; isLoading: boolean; isError: boolean; refetch: () => void } {
  const query = useQuery({
    queryKey: queryKeys.reports.marginHistory(clientId),
    queryFn: () => reportsApi.marginHistory(clientId),
    enabled,
    staleTime: 60_000,
  })
  return {
    data: query.data ? mapApiMarginHistory(query.data.points) : [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}

/** One member's logged-hours trend, last 6 months (owner+admin). Shaped for the chart. */
export function useReportsHoursHistory(
  teamMemberId: string,
  enabled: boolean,
): { data: { label: string; value: number }[]; isLoading: boolean; isError: boolean; refetch: () => void } {
  const query = useQuery({
    queryKey: queryKeys.reports.hoursHistory(teamMemberId),
    queryFn: () => reportsApi.hoursHistory(teamMemberId),
    enabled: enabled && teamMemberId.length > 0,
    staleTime: 60_000,
  })
  return {
    data: query.data ? query.data.points.map((p) => ({ label: p.period, value: p.hours })) : [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}

/** Per-member workload + real monthly cost (cost needs `teamCost`; period-agnostic). */
export function useReportsCapacity(
  enabled: boolean,
): { data: TeamCapacityReportItem[]; isLoading: boolean; isError: boolean; refetch: () => void } {
  const query = useQuery({
    queryKey: queryKeys.reports.capacity(),
    queryFn: () => reportsApi.capacity(),
    enabled,
    staleTime: 60_000,
  })
  return {
    data: query.data ? mapApiCapacity(query.data.members) : [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}
