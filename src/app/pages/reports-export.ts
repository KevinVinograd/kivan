import { csvCell, downloadCsv, today } from '@/app/lib/csv'
import type { ReportTab } from './reports-tabs-header'
import type {
  ClientProfitabilityReportItem,
  CollectionDetailRow,
  ProductivityReportItem,
  ReportDataset,
  TeamCapacityReportItem,
} from './reports-types'

/**
 * Client-side CSV export for the Reportes module. Serializes the ACTIVE tab's
 * underlying table (the data already materialized in-page) and triggers a browser
 * download — no backend, mirroring `clients-export.ts` / `account-ledger-export.ts`.
 * Amounts stay raw numbers and dates collapse to `YYYY-MM-DD` so the output is
 * spreadsheet-friendly. The Resumen tab has no single table, so it exports the
 * per-client profitability rows (its richest overview).
 *
 * Returns the number of rows written; the caller owns the empty guard + toast.
 */

type Column<T> = { header: string; value: (row: T) => string | number }

/** ISO date -> YYYY-MM-DD (empty when absent). */
function isoDate(iso?: string): string {
  return iso ? iso.slice(0, 10) : ''
}

const PRODUCTIVITY_COLUMNS: Column<ProductivityReportItem>[] = [
  { header: 'Persona', value: (r) => r.personName },
  { header: 'Cliente', value: (r) => r.clientName },
  { header: 'Tarea', value: (r) => r.taskType },
  { header: 'Servicio', value: (r) => r.service },
  { header: 'Horas', value: (r) => r.hours },
  { header: 'Fecha', value: (r) => isoDate(r.date) },
  { header: 'Extra', value: (r) => (r.isExtra ? 'Sí' : 'No') },
]

const PROFITABILITY_COLUMNS: Column<ClientProfitabilityReportItem>[] = [
  { header: 'Cliente', value: (r) => r.clientName },
  { header: 'Servicio', value: (r) => r.service },
  { header: 'Ingresos', value: (r) => r.ingresos },
  { header: 'Costos', value: (r) => r.costos },
  { header: 'Rentabilidad', value: (r) => r.rentabilidad },
  { header: 'Margen %', value: (r) => r.margen },
  { header: 'Horas', value: (r) => r.horas },
  { header: 'Estado', value: (r) => r.status },
]

const CAPACITY_COLUMNS: Column<TeamCapacityReportItem>[] = [
  { header: 'Persona', value: (r) => r.personName },
  { header: 'Rol', value: (r) => r.role },
  { header: 'Clientes activos', value: (r) => r.clientsActive },
  { header: 'Horas', value: (r) => r.hoursLogged },
  // Empty, never 0: a person without a configured capacity is not "0 h".
  { header: 'Capacidad', value: (r) => r.capacity ?? '' },
  { header: 'Utilización %', value: (r) => r.utilization ?? '' },
  // Empty, never 0, for the same reason as Capacidad above and with a sharper edge: a 0
  // in a sheet the studio reconciles against reads as a person who costs nothing, and
  // most assignments carry no cost yet.
  { header: 'Costo', value: (r) => r.personCost ?? '' },
  { header: 'Costo por hora', value: (r) => r.costPerHour ?? '' },
  // Travels with the amount so the sheet can show that a total is PARTIAL. Without it a
  // half-costed person exports a real number that understates, indistinguishable from a
  // complete one.
  { header: 'Clientes con costo', value: (r) => `${r.costedAssignments}/${r.totalAssignments}` },
]

const COBROS_COLUMNS: Column<CollectionDetailRow>[] = [
  { header: 'Cliente', value: (r) => r.clientName },
  { header: 'Servicio', value: (r) => r.service },
  { header: 'Vencimiento', value: (r) => isoDate(r.dueDate) },
  { header: 'Estado', value: (r) => r.statusLabel },
  { header: 'Total', value: (r) => r.totalAmount },
  { header: 'Cobrado', value: (r) => r.collectedAmount },
]

function build<T>(columns: Column<T>[], rows: T[], filename: string): number {
  const header = columns.map((col) => csvCell(col.header)).join(',')
  const lines = rows.map((row) => columns.map((col) => csvCell(col.value(row))).join(','))
  downloadCsv(header, lines, filename)
  return rows.length
}

/** Export the active tab's table. Returns rows written (0 → nothing to export). */
export function exportReportCsv(tab: ReportTab, dataset: ReportDataset): number {
  const stamp = today()
  switch (tab) {
    case 'productividad':
      return build(PRODUCTIVITY_COLUMNS, dataset.productivity, `reportes-productividad-${stamp}.csv`)
    case 'carga':
      return build(CAPACITY_COLUMNS, dataset.capacity, `reportes-carga-${stamp}.csv`)
    case 'finanzas':
      return build(COBROS_COLUMNS, dataset.financials.cobrosDetail, `reportes-finanzas-${stamp}.csv`)
    case 'rentabilidad':
    case 'resumen':
    default:
      return build(PROFITABILITY_COLUMNS, dataset.profitability, `reportes-rentabilidad-${stamp}.csv`)
  }
}
