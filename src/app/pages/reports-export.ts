import { csvCell, downloadCsv, today } from '@/app/lib/csv'
import type { ReportTab } from './reports-tabs-header'
import type {
  ClientProfitabilityReportItem,
  CollectionDetailRow,
  ProductivityReportItem,
  ReportDataset,
  TeamCapacityReportItem,
} from './reports-types'

type Column<T> = { header: string; value: (row: T) => string | number }

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
  { header: 'Capacidad', value: (r) => r.capacity ?? '' },
  { header: 'Utilización %', value: (r) => r.utilization ?? '' },
  { header: 'Costo', value: (r) => r.personCost ?? '' },
  { header: 'Costo por hora', value: (r) => r.costPerHour ?? '' },
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
