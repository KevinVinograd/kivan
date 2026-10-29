import { useQuery } from '@tanstack/react-query'

import { clientsApi } from '@/api/clients'
import { reportsApi, type ClientMonthDto } from '@/api/reports'
import { queryKeys } from '@/queries/keys'

export interface ClientMonthFigures {
  billed: number
  team: number | null
  production: number | null
  viatics: number
  other: number
  total: number
}

const major = (minor: string) => Number(minor) / 100

export function clientMonthFromDto(dto: ClientMonthDto): ClientMonthFigures {
  return {
    billed: major(dto.billedMinor),
    team: dto.costTeamMinor === null ? null : major(dto.costTeamMinor),
    production: dto.costProductionMinor === null ? null : major(dto.costProductionMinor),
    viatics: major(dto.costViaticsMinor),
    other: major(dto.costOtherMinor),
    total: major(dto.costTotalMinor),
  }
}

export function useClientMonth(clientId: string, period: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.reports.clientMonth(clientId, period),
    queryFn: async () => clientMonthFromDto(await reportsApi.clientMonth(clientId, `${period}-01`)),
    enabled,
    staleTime: 0,
  })
}

export function useClientServiceLines(clientId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.clients.serviceLines(clientId),
    queryFn: () => clientsApi.listServiceLines(clientId),
    enabled,
  })
}
