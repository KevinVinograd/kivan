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

export function useReportsProfitability(
  period: string,
  enabled: boolean,
): {
  data: ClientProfitabilityReportItem[]
  otherLaneClientCount: number
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
    data: query.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}

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
