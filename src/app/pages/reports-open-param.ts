import type { ReportTab } from './reports-tabs-header'
import type { ReportDataset } from './reports-types'

export type OpenKind = 'person' | 'client' | 'bucket' | 'receivable' | 'payment'
export type OpenRef = { kind: OpenKind; id: string }

const OPEN_KINDS: readonly OpenKind[] = ['person', 'client', 'bucket', 'receivable', 'payment']

function bucketIds(dataset: ReportDataset): string[] {
  const f = dataset.financials
  return [
    ...f.cobrosPorEstado.map((bucket) => `cobros-${bucket.id}`),
    ...f.pagosPorEstado.map((bucket) => `pagos-${bucket.id}`),
    ...f.facturacion.map((bucket) => `facturacion-${bucket.id}`),
    ...f.gastosFijosList.map((line) => `gastos-${line.id}`),
  ]
}

function receivableIds(dataset: ReportDataset): string[] {
  const f = dataset.financials
  return [...f.cobrosDetail.map((row) => row.id), ...f.facturacionDetail.map((row) => row.id)]
}

function paymentIds(dataset: ReportDataset): string[] {
  const f = dataset.financials
  return [...f.pagosDetail.map((row) => row.id), ...f.gastosFijosList.map((line) => line.id)]
}

const ID_SOURCE: Record<OpenKind, (dataset: ReportDataset) => string[]> = {
  person: (dataset) => dataset.capacity.map((person) => person.personId),
  client: (dataset) => dataset.profitability.map((client) => client.clientId),
  bucket: bucketIds,
  receivable: receivableIds,
  payment: paymentIds,
}

const TAB_KINDS: Record<ReportTab, OpenKind[]> = {
  resumen: ['person', 'client'],
  productividad: ['person'],
  rentabilidad: ['client'],
  carga: ['person'],
  finanzas: ['bucket', 'receivable', 'payment'],
}

function isOpenKind(value: string): value is OpenKind {
  return (OPEN_KINDS as readonly string[]).includes(value)
}

export function readOpenRef(
  params: URLSearchParams,
  tab: ReportTab,
  dataset: ReportDataset,
): OpenRef | null {
  const raw = params.get('open')
  if (!raw) return null
  const separator = raw.indexOf(':')
  if (separator === -1) return null
  const kind = raw.slice(0, separator)
  const id = raw.slice(separator + 1)
  if (!id || !isOpenKind(kind)) return null
  if (!TAB_KINDS[tab].includes(kind)) return null
  return ID_SOURCE[kind](dataset).includes(id) ? { kind, id } : null
}

export function withOpenRef(params: URLSearchParams, ref: OpenRef): URLSearchParams {
  const next = new URLSearchParams(params)
  next.set('open', `${ref.kind}:${ref.id}`)
  return next
}

export function withoutOpenRef(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete('open')
  return next
}
