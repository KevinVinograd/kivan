/**
 * The Resumen's monthly P&L — Fee mensual − Costo = Ganancia — from real figures.
 *
 * Costo is what the client cost the studio this month as the server counts it
 * (`GET /reports/clients/:id/month`): the fixed team's monthly amounts, the creators of its
 * approved productions, viáticos, and what its cobros recorded. It used to be derived as
 * fee × (1 − margin%), so a client with no cobro yet had no cost at all, and HOLD read the
 * Resumen of every new client as empty (review of 2026-10-21).
 *
 * Fee is what this month's cobros billed. Before there is one, it is the CONTRACTED fee,
 * said as such: the contract is not evidence that anyone billed it, and the tile says
 * "Contratado, sin cobro este mes" rather than passing it off as billed. Ganancia is then
 * an estimate, and only in pesos: costs are pesos, and a dollar fee minus a peso cost is a
 * figure in no currency.
 */
import type { Currency } from '@hold/shared'

import type { ClientServiceDto } from '@/api/clients'
import type { Client } from './clients-mock-data'
import type { BreakdownRow } from './clients-format'
import { formatCompactCurrency } from './clients-format'
import type { ClientMonthFigures } from './client-month-data'
import { formatMoney } from './cobranza-format'
import { monthlyTotal } from './clients-service-lines-format'

/** The fee the contract says: its monthly lines when it has any, else the hand-typed abono. */
export function contractedFeeOf(client: Client, lines: ClientServiceDto[] | undefined): number {
  const priced = lines?.some((l) => l.active && l.billingMode === 'monthly') ?? false
  return priced ? monthlyTotal(lines ?? []) : client.monthlyFee
}

const NOT_AVAILABLE = 'No disponible'

function feeAmount(amount: number, currency: Currency): string {
  return currency === 'ARS' ? formatCompactCurrency(amount) : formatMoney(amount, currency)
}

/**
 * `month` is absent while it loads, when it failed, and for a viewer without
 * `profitability` (who is shown the Fee tile alone).
 */
export function clientProfitBreakdown(
  client: Client,
  month: ClientMonthFigures | undefined,
  contractedFee: number,
): BreakdownRow[] {
  const billedAnyLane = client.currentMonthDueAmount
  const billedPesos = month && month.billed > 0 ? month.billed : null
  const contracted = billedAnyLane == null && contractedFee > 0
  const fee: BreakdownRow = billedPesos !== null
    ? { label: 'Fee mensual', value: formatCompactCurrency(billedPesos) }
    : billedAnyLane != null
      ? { label: 'Fee mensual', value: feeAmount(billedAnyLane, client.currency) }
      : contracted
        ? {
            label: 'Fee mensual',
            value: feeAmount(contractedFee, client.currency),
            hint: 'Contratado, sin cobro este mes',
          }
        : { label: 'Fee mensual', value: 'Sin cobro este mes' }
  if (!month) {
    return [fee, { label: 'Costo', value: NOT_AVAILABLE }, { label: 'Ganancia', value: NOT_AVAILABLE }]
  }
  const cost: BreakdownRow = { label: 'Costo', value: formatCompactCurrency(month.total) }
  // Billed in pesos: the real margin, the same one Rentabilidad states. Not billed yet and
  // contracted in pesos: an estimate on the contract. Anything else mixes lanes.
  const profit: BreakdownRow =
    billedPesos !== null
      ? { label: 'Ganancia', value: formatCompactCurrency(billedPesos - month.total) }
      : contracted && client.currency === 'ARS'
        ? { label: 'Ganancia', value: formatCompactCurrency(contractedFee - month.total), hint: 'Estimada' }
        : { label: 'Ganancia', value: NOT_AVAILABLE }
  return [fee, cost, profit]
}

/**
 * "Costo del mes: equipo fijo $1,2 M · producciones $300 mil · viáticos $40 mil" — what the
 * Costo tile adds up, so a production's cost is visibly in it. Null when nothing cost.
 */
export function monthCostDetail(month: ClientMonthFigures): string | null {
  const parts = [
    month.team ? `equipo fijo ${formatCompactCurrency(month.team)}` : null,
    month.production ? `producciones ${formatCompactCurrency(month.production)}` : null,
    month.viatics ? `viáticos ${formatCompactCurrency(month.viatics)}` : null,
    month.other ? `pauta y fijos ${formatCompactCurrency(month.other)}` : null,
  ].filter((part): part is string => part !== null)
  return parts.length > 0 ? `Costo del mes: ${parts.join(' · ')}` : null
}
