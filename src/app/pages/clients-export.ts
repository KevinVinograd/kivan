import { csvCell, downloadCsv, today } from '@/app/lib/csv'
import type { Client } from './clients-mock-data'
import { BILLING_CYCLE_LABEL, netMonthlyFee, PAYMENT_METHOD_LABEL } from './clients-format'

type Column = {
  header: string
  value: (client: Client) => string | number
}

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
  { header: 'Moneda', value: (c) => c.currency },
  { header: 'Estado de pago', value: (c) => c.paymentStatus ?? '' },
  { header: 'Pagado mes actual', value: (c) => c.currentMonthPaidAmount ?? '' },
  { header: 'A cobrar mes actual', value: (c) => c.currentMonthDueAmount ?? '' },
  { header: 'Próximo cobro', value: (c) => isoDate(c.expectedPaymentDate) },
  { header: 'Último pago', value: (c) => isoDate(c.lastPaymentDate) },
  { header: 'Facturación', value: (c) => c.billingEntity ?? '' },
  { header: 'Estado de factura', value: (c) => c.invoiceStatus ?? '' },
  { header: 'Rubro', value: (c) => c.clientType ?? '' },
  { header: 'Medio de pago', value: (c) => (c.paymentMethod ? PAYMENT_METHOD_LABEL[c.paymentMethod] : '') },
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
  includeProfitability: boolean
}

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
