import type { Currency } from '@hold/shared'

import type { ClientServiceDto } from '@/api/clients'
import type { Client } from './clients-mock-data'
import type { BreakdownRow } from './clients-format'
import { formatCompactCurrency } from './clients-format'
import type { ClientMonthFigures } from './client-month-data'
import { formatMoney } from './cobranza-format'
import { monthlyTotal } from './clients-service-lines-format'

export function contractedFeeOf(client: Client, lines: ClientServiceDto[] | undefined): number {
  const priced = lines?.some((l) => l.active && l.billingMode === 'monthly') ?? false
  return priced ? monthlyTotal(lines ?? []) : client.monthlyFee
}

const NOT_AVAILABLE = 'No disponible'

function feeAmount(amount: number, currency: Currency): string {
  return currency === 'ARS' ? formatCompactCurrency(amount) : formatMoney(amount, currency)
}

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
  const profit: BreakdownRow =
    billedPesos !== null
      ? { label: 'Ganancia', value: formatCompactCurrency(billedPesos - month.total) }
      : contracted && client.currency === 'ARS'
        ? { label: 'Ganancia', value: formatCompactCurrency(contractedFee - month.total), hint: 'Estimada' }
        : { label: 'Ganancia', value: NOT_AVAILABLE }
  return [fee, cost, profit]
}

export function monthCostDetail(month: ClientMonthFigures): string | null {
  const parts = [
    month.team ? `equipo fijo ${formatCompactCurrency(month.team)}` : null,
    month.production ? `producciones ${formatCompactCurrency(month.production)}` : null,
    month.viatics ? `viáticos ${formatCompactCurrency(month.viatics)}` : null,
    month.other ? `pauta y fijos ${formatCompactCurrency(month.other)}` : null,
  ].filter((part): part is string => part !== null)
  return parts.length > 0 ? `Costo del mes: ${parts.join(' · ')}` : null
}
