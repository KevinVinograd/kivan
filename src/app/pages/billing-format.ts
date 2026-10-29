import { formatCurrency as formatInLane, LANES, LANE_FILTER_OPTIONS, LANE_NOUN } from '@/lib/currency'
import type { Currency } from '@hold/shared'

import {
  formatCompactCurrency,
  TAX_PROFILE_LABEL,
  type FilterField,
  type Kpi,
} from './cobranza-format'
import { balanceOf, billingStatusBadge } from './cobros-format'
import type { BillingStatus, Receivable } from './cobros-mock-data'

const NEEDS_INVOICE: BillingStatus[] = ['no_invoice', 'pending']
const BILLED: BillingStatus[] = ['invoiced', 'sent', 'manual']

const BILLING_STATUSES: BillingStatus[] = [
  'no_invoice',
  'pending',
  'invoiced',
  'sent',
  'error_arca',
  'manual',
  'not_required',
]

const BILLING_FILTER_OPTIONS = BILLING_STATUSES.map((value) => ({
  value,
  label: billingStatusBadge(value).label,
}))

const MONOTRIBUTO_FILTER_OPTIONS = (
  ['monotributo_1', 'monotributo_2', 'monotributo_3', 'unassigned'] as const
).map((value) => ({ value, label: TAX_PROFILE_LABEL[value] }))

export const BILLING_FILTER_FIELDS: FilterField[] = [
  { id: 'billingStatus', label: 'Estado de facturación', options: BILLING_FILTER_OPTIONS },
  { id: 'taxProfileId', label: 'Monotributo', options: MONOTRIBUTO_FILTER_OPTIONS },
  { id: 'currency', label: 'Moneda', options: LANE_FILTER_OPTIONS },
]

export function billingKpis(rows: Receivable[]): Kpi[] {
  const isArs = (r: Receivable) => r.currency === 'ARS'
  const liveAllLanes = rows.filter((r) => r.status !== 'cancelled')
  const live = liveAllLanes.filter(isArs)
  const sum = (items: Receivable[], pick: (r: Receivable) => number) =>
    items.reduce((total, r) => total + pick(r), 0)

  const billableAllLanes = liveAllLanes.filter((r) => r.billingStatus !== 'not_required')
  const billable = live.filter((r) => r.billingStatus !== 'not_required')
  const pendingToInvoice = sum(
    billable.filter((r) => NEEDS_INVOICE.includes(r.billingStatus)),
    (r) => r.totalAmount,
  )
  const billed = sum(
    live.filter((r) => BILLED.includes(r.billingStatus)),
    (r) => r.totalAmount,
  )
  const billedNotCollected = sum(
    live.filter((r) => BILLED.includes(r.billingStatus)),
    balanceOf,
  )
  const issuedCount = liveAllLanes.filter((r) => Boolean(r.invoiceNumber)).length
  const errorCount = liveAllLanes.filter((r) => r.billingStatus === 'error_arca').length
  const unassignedCount = billableAllLanes.filter(
    (r) => NEEDS_INVOICE.includes(r.billingStatus) && r.taxProfileId === 'unassigned',
  ).length

  const figures: Kpi[] = [
    ...LANES.map((currency) => {
      const figure = laneFigure(rows, currency)
      if (currency !== 'ARS') return figure
      return {
        ...figure,
        tone: errorCount === 0 && pendingToInvoice > 0 ? ('warning' as const) : ('default' as const),
      }
    }),
    { id: 'billed', label: 'Facturado', value: formatCompactCurrency(billed), tone: 'default' },
    {
      id: 'billedNotCollected',
      label: 'Facturado no cobrado',
      value: formatCompactCurrency(billedNotCollected),
      tone: 'default',
    },
    { id: 'issued', label: 'Comprobantes emitidos', value: String(issuedCount), tone: 'default' },
    {
      id: 'errorArca',
      label: 'Error ARCA',
      value: String(errorCount),
      tone: errorCount > 0 ? 'danger' : 'default',
    },
    {
      id: 'unassigned',
      label: 'Sin monotributo',
      value: String(unassignedCount),
      tone: 'default',
    },
  ]
  return figures
}

function laneFigure(rows: Receivable[], currency: Currency): Kpi {
  const live = rows.filter((r) => r.currency === currency && r.status !== 'cancelled')
  const pending = live.filter((r) => NEEDS_INVOICE.includes(r.billingStatus))
  const total = pending.reduce((sum, r) => sum + r.totalAmount, 0)
  return {
    id: heroIdFor(currency),
    label: `Pendiente de facturar en ${LANE_NOUN[currency]}`,
    value: formatInLane(total, currency),
    tone: 'default' as const,
    hint:
      live.length === 0
        ? 'sin cobros en el período'
        : pending.length === live.length
          ? live.length === 1
            ? '1 cobro'
            : `${live.length} cobros`
          : pending.length === 0
            ? live.length === 1
              ? '1 cobro, nada pendiente'
              : `${live.length} cobros, nada pendiente`
            : `${pending.length} de ${live.length} sin facturar`,
  }
}

const heroIdFor = (currency: Currency) => `toInvoice${currency}`

export const BILLING_HERO_IDS: [string, string] = [heroIdFor('ARS'), heroIdFor('USD')]
