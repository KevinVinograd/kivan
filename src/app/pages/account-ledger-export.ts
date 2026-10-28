import { csvCell, downloadCsv, today } from '@/app/lib/csv'
import { formatMonthYear } from './account-ledger-format'
import type { LedgerEntityType, PeriodStatement } from './account-ledger-types'

/**
 * Client-side CSV export for the Cuentas corrientes module — one row per
 * (account, period) statement, mirroring the Team/Clients exports (raw numbers,
 * UTF-8 BOM + RFC-4180 quoting via `lib/csv.ts`). The caller owns the
 * empty-selection guard and the success toast.
 */
export type AccountStatementExportRow = {
  name: string
  statements: PeriodStatement[]
}

type Column = {
  header: string
  value: (name: string, statement: PeriodStatement) => string | number
}

/** Entity-aware column labels — client is the collection side, colaboradora and
 *  proveedor the payment side (provider invoices carry a vencimiento + concepto,
 *  like a client charge but settled by a pago). */
const COLUMN_LABELS: Record<
  LedgerEntityType,
  { name: string; charged: string; settled: string; due: string; reference: string }
> = {
  client: { name: 'Cliente', charged: 'Facturado', settled: 'Cobrado', due: 'Vencimiento', reference: 'Factura asociada' },
  teamMember: { name: 'Colaboradora', charged: 'Generado', settled: 'Pagado', due: 'Fecha de pago', reference: 'Concepto' },
  provider: { name: 'Proveedor', charged: 'Facturado', settled: 'Pagado', due: 'Vencimiento', reference: 'Concepto' },
}

const SCOPE_SLUG: Record<LedgerEntityType, string> = {
  client: 'clientes',
  teamMember: 'colaboradoras',
  provider: 'proveedores',
}

function columns(entityType: LedgerEntityType): Column[] {
  const labels = COLUMN_LABELS[entityType]
  return [
    { header: labels.name, value: (name) => name },
    { header: 'Período', value: (_name, s) => formatMonthYear(s.period) },
    // The three money columns are the PESO lane, so the sheet says so in its headers
    // rather than shipping bare numbers whose unit the reader has to guess. They used to
    // be sums across every lane, which no header could have made true.
    { header: `${labels.charged} (ARS)`, value: (_name, s) => s.charged },
    { header: `${labels.settled} (ARS)`, value: (_name, s) => s.settled },
    { header: 'Saldo (ARS)', value: (_name, s) => s.balance },
    // What the three above leave out. A `Moneda` column would have been worse than none:
    // one lane code beside a figure that mixed three is a label authenticating the lie.
    { header: 'Movimientos en otra moneda', value: (_name, s) => s.otherLaneCount },
    { header: 'Estado', value: (_name, s) => s.status },
    { header: labels.due, value: (_name, s) => s.dueDate ?? '' },
    { header: labels.reference, value: (_name, s) => s.reference ?? '' },
    { header: 'Notas', value: (_name, s) => s.notes ?? '' },
  ]
}

export function exportAccountLedgerCsv(
  entityType: LedgerEntityType,
  rows: AccountStatementExportRow[],
): void {
  const cols = columns(entityType)
  const header = cols.map((col) => csvCell(col.header)).join(',')
  const body = rows.flatMap((row) =>
    row.statements.map((statement) =>
      cols.map((col) => csvCell(col.value(row.name, statement))).join(','),
    ),
  )
  downloadCsv(header, body, `cuentas-corrientes-${SCOPE_SLUG[entityType]}-${today()}.csv`)
}
