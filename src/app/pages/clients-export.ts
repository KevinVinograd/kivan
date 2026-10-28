import { csvCell, downloadCsv, today } from '@/app/lib/csv'
import type { Client } from './clients-mock-data'
import { BILLING_CYCLE_LABEL, netMonthlyFee, PAYMENT_METHOD_LABEL } from './clients-format'

/**
 * Client-side CSV export for the Clients module. Builds a CSV from the in-memory
 * Client records and triggers a browser download — no backend. Profitability
 * columns are included only when `includeProfitability` is true (owner scope),
 * keeping margin data out of admin/employee exports (mirrors the role scoping of
 * the profitability surfaces). Amounts stay raw numbers and dates collapse to
 * `YYYY-MM-DD` so the output is spreadsheet-friendly.
 */

type Column = {
  header: string
  value: (client: Client) => string | number
}

/** ISO timestamp -> YYYY-MM-DD (empty when absent). */
function isoDate(iso?: string): string {
  return iso ? iso.slice(0, 10) : ''
}

const BASE_COLUMNS: Column[] = [
  { header: 'Nombre', value: (c) => c.name },
  { header: 'Razón social', value: (c) => c.businessName ?? '' },
  { header: 'CUIT', value: (c) => c.taxId ?? '' },
  { header: 'Estado', value: (c) => c.status },
  { header: 'Servicios', value: (c) => c.services.join('; ') },
  { header: 'Abono mensual', value: (c) => c.monthlyFee },
  // Without this the amounts above are indistinguishable between currencies, which
  // is the worst failure mode for a sheet the studio reconciles against.
  { header: 'Moneda', value: (c) => c.currency },
  // Empty, never 0 or 'undefined': the client had no cobro this month, and a 0 in a
  // sheet the studio reconciles against reads as a real amount.
  { header: 'Estado de pago', value: (c) => c.paymentStatus ?? '' },
  { header: 'Pagado mes actual', value: (c) => c.currentMonthPaidAmount ?? '' },
  { header: 'A cobrar mes actual', value: (c) => c.currentMonthDueAmount ?? '' },
  { header: 'Próximo cobro', value: (c) => isoDate(c.expectedPaymentDate) },
  { header: 'Último pago', value: (c) => isoDate(c.lastPaymentDate) },
  { header: 'Facturación', value: (c) => c.billingEntity ?? '' },
  { header: 'Estado de factura', value: (c) => c.invoiceStatus ?? '' },
  { header: 'Rubro', value: (c) => c.clientType ?? '' },
  { header: 'Medio de pago', value: (c) => (c.paymentMethod ? PAYMENT_METHOD_LABEL[c.paymentMethod] : '') },
  // The rate, and the abono it actually produces. Both, because the sheet is
  // reconciled by hand: a percentage alone makes the reader do the arithmetic, and a
  // net amount alone hides why it disagrees with the contract. Empty, never 0 or 0%,
  // when no discount was agreed — same convention as the money columns above.
  { header: 'Descuento %', value: (c) => (c.discountPercentBp ? c.discountPercentBp / 100 : '') },
  {
    header: 'Abono con descuento',
    value: (c) => (c.discountPercentBp ? netMonthlyFee(c) : ''),
  },
  { header: 'Ciclo', value: (c) => (c.billingCycle ? BILLING_CYCLE_LABEL[c.billingCycle] : '') },
  { header: 'Fee por proyecto', value: (c) => c.projectFee ?? '' },
  { header: 'Fin del proyecto', value: (c) => isoDate(c.projectEndDate) },
  { header: 'Contacto', value: (c) => c.contactName ?? '' },
  { header: 'Email', value: (c) => c.billingEmail ?? '' },
  { header: 'Email alternativo', value: (c) => c.secondaryEmail ?? '' },
  { header: 'Celular', value: (c) => c.phone ?? '' },
  { header: 'Domicilio', value: (c) => c.address ?? '' },
  { header: 'Contacto administrativo', value: (c) => c.adminContactName ?? '' },
  { header: 'Email administrativo', value: (c) => c.adminContactEmail ?? '' },
  { header: 'Celular administrativo', value: (c) => c.adminContactPhone ?? '' },
  { header: 'Fecha de inicio', value: (c) => isoDate(c.startDate) },
]

const PROFITABILITY_COLUMNS: Column[] = [
  { header: 'Rentabilidad %', value: (c) => c.profitabilityPercent ?? '' },
  { header: 'Rentabilidad', value: (c) => c.profitabilityStatus ?? '' },
]

export type ExportClientsOptions = {
  /** Include the profitability columns. Owner scope only — see role-access. */
  includeProfitability: boolean
}

/**
 * Build a CSV from the given clients and trigger a browser download. The caller
 * is responsible for the empty-selection guard and the success toast.
 */
export function exportClientsCsv(clients: Client[], options: ExportClientsOptions): void {
  const columns = options.includeProfitability
    ? [...BASE_COLUMNS, ...PROFITABILITY_COLUMNS]
    : BASE_COLUMNS

  const header = columns.map((col) => csvCell(col.header)).join(',')
  const rows = clients.map((client) =>
    columns.map((col) => csvCell(col.value(client))).join(','),
  )
  downloadCsv(header, rows, `clientes-${today()}.csv`)
}
