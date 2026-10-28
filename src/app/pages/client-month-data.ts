/**
 * Server data for a client's Resumen: its priced contract lines and its month in pesos.
 *
 * Both are react-query reads, so the Resumen follows a line or a production the moment it
 * is written — the page's client row is a one-shot fetch, and reading the fee or the
 * services from it is how a new client's Resumen stayed empty with its services already
 * loaded (HOLD's review of 2026-10-21).
 */
import { useQuery } from '@tanstack/react-query'

import { clientsApi } from '@/api/clients'
import { reportsApi, type ClientMonthDto } from '@/api/reports'
import { queryKeys } from '@/queries/keys'

/** One client's month in pesos (`GET /reports/clients/:id/month`). */
export interface ClientMonthFigures {
  /** What its peso cobros billed; 0 while the month has none. */
  billed: number
  /** What the studio pays its fixed team. Null when the viewer may not see pay. */
  team: number | null
  /** What its approved productions paid their creators. Null when the viewer may not see pay. */
  production: number | null
  viatics: number
  /** Pauta, fijos and the legacy area costs recorded on its cobros. */
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

/** `period` is `YYYY-MM`. Only for a viewer holding `profitability` (the route's gate). */
export function useClientMonth(clientId: string, period: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.reports.clientMonth(clientId, period),
    queryFn: async () => clientMonthFromDto(await reportsApi.clientMonth(clientId, `${period}-01`)),
    enabled,
    // Productions and assignments written elsewhere move these numbers; opening the client
    // again must show them, not a minute-old copy.
    staleTime: 0,
  })
}

/** A client's priced contract lines — the one read Servicios valorizados and the Resumen share. */
export function useClientServiceLines(clientId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.clients.serviceLines(clientId),
    queryFn: () => clientsApi.listServiceLines(clientId),
    enabled,
  })
}
