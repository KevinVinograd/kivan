import { useMemo } from 'react'

import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { KpiSummaryCard, type Kpi } from '@/app/components/patterns'
import type { Client } from './clients-mock-data'
import { formatCompactCurrency, netMonthlyFee, NO_REGISTRO } from './clients-format'

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function portfolioTotals(clients: Client[]) {
  const isArs = (client: Client) => client.currency === 'ARS'
  const active = clients.filter((client) => client.status === 'active')
  const mrr = active.filter(isArs).reduce((sum, client) => sum + netMonthlyFee(client), 0)
  const outstanding = clients.filter(isArs).reduce((sum, client) => {
    if (client.currentMonthDueAmount == null || client.paymentStatus === 'paid') return sum
    return sum + Math.max(client.currentMonthDueAmount - (client.currentMonthPaidAmount ?? 0), 0)
  }, 0)
  return {
    activeCount: active.length,
    totalCount: clients.length,
    mrr,
    outstanding,
    overdueCount: clients.filter((client) => client.paymentStatus === 'overdue').length,
    otherLaneCount: clients.filter((client) => !isArs(client)).length,
  }
}

export function ClientsSummaryKpis({ clients }: { clients: Client[] }) {
  const { role, capabilities } = useRole()

  const kpis = useMemo<Kpi[]>(() => {
    const active = clients.filter((client) => client.status === 'active')
    const { mrr, outstanding, overdueCount, otherLaneCount } = portfolioTotals(clients)
    const laneNote = otherLaneCount > 0 ? `, ${otherLaneCount} en otra moneda` : ''

    const list: Kpi[] = [
      {
        id: 'active',
        label: 'Clientes activos',
        value: String(active.length),
        hint: `de ${clients.length} en total`,
      },
      {
        id: 'mrr',
        label: 'Ingreso mensual',
        value: formatCompactCurrency(mrr),
        hint: `MRR de clientes activos en pesos${laneNote}`,
      },
      {
        id: 'outstanding',
        label: 'Por cobrar',
        value: formatCompactCurrency(outstanding),
        hint:
          (overdueCount > 0 ? plural(overdueCount, 'vencido', 'vencidos') : 'Sin vencidos') +
          laneNote,
        tone: overdueCount > 0 ? 'danger' : 'default',
      },
    ]

    if (hasCapability(capabilities, 'profitability')) {
      const withMargin = active.filter((client) => client.profitabilityPercent != null)
      const avg = withMargin.length
        ? Math.round(
            withMargin.reduce((sum, client) => sum + (client.profitabilityPercent as number), 0) /
              withMargin.length,
          )
        : null
      list.push({
        id: 'profitability',
        label: 'Rentabilidad promedio',
        value: avg != null ? `${avg}%` : NO_REGISTRO,
        hint: 'margen de clientes activos',
      })
    }

    return list
  }, [clients, role])

  return <KpiSummaryCard figures={kpis} heroId="outstanding" collapsible storageKey="clients" />
}
