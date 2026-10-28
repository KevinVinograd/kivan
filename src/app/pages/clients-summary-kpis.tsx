import { useMemo } from 'react'

import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { KpiSummaryCard, type Kpi } from '@/app/components/patterns'
import type { Client } from './clients-mock-data'
import { formatCompactCurrency, netMonthlyFee, NO_REGISTRO } from './clients-format'

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Portfolio summary row above the Clientes toolbar — owner/admin only (the page
 * hides it for the employee, who sees a read-only roster of their own accounts).
 * Rentabilidad promedio needs the `profitability` capability; without it a role keeps the
 * operational and billing figures (activos, ingreso, por cobrar) without the
 * margin. Figures span the whole portfolio, independent of the table filters.
 */

/**
 * The portfolio totals behind the strip. Extracted from the component so the
 * arithmetic is unit-testable: it lived inside a `useMemo` and was therefore
 * unreachable without a renderer, which is exactly how it kept summing currencies
 * together unnoticed.
 *
 * Both money figures are the ARS lane ONLY. A client's fee can be in USD,
 * there is no FX rate anywhere in the product, and `money.ts` makes cross-currency
 * arithmetic throw by design, so adding a USD fee into a peso total would print a
 * number in no currency at all under a `$` sign. Same convention the backend
 * aggregations already use (`monthlyRepo.cobroActualsByClient`, `billingRepo.kpis`,
 * `paymentsRepo.kpis`).
 *
 * The excluded clients are COUNTED and surfaced, never silently dropped: a total
 * that quietly omits money is the failure mode this guard exists to prevent, not a
 * smaller version of it.
 */
export function portfolioTotals(clients: Client[]) {
  const isArs = (client: Client) => client.currency === 'ARS'
  const active = clients.filter((client) => client.status === 'active')
  // Net of each client's standing discount. The gross sum overstates the recurring
  // revenue by exactly the discounts the studio has already agreed to give away, and
  // this tile sits beside `Por cobrar`, which is derived from receivables and therefore
  // already net — two figures on one card disagreeing about the same client is the
  // failure this avoids.
  const mrr = active.filter(isArs).reduce((sum, client) => sum + netMonthlyFee(client), 0)
  // Cash still owed this month across the unpaid statuses, never below zero. A client
  // with no cobro this month contributes NOTHING — it is not a zero-balance client, it
  // is one nobody billed, and folding it in as 0 would be indistinguishable from paid.
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
        // §6 focal figure of the strip (`heroId` below) → the one type-metric hero;
        // keeps its fg-danger when there are vencidos (the number IS the status).
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
        // Secondary support tile → fg-default. Margin health is not the strip's
        // focal status (Por cobrar carries the one tint); the average % is not a
        // threshold alarm, so the figure stays neutral (figure-color-restraint).
        label: 'Rentabilidad promedio',
        value: avg != null ? `${avg}%` : NO_REGISTRO,
        hint: 'margen de clientes activos',
      })
    }

    return list
  }, [clients, role])

  return <KpiSummaryCard figures={kpis} heroId="outstanding" collapsible storageKey="clients" />
}
