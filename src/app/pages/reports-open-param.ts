import type { ReportTab } from './reports-tabs-header'
import type { ReportDataset } from './reports-types'

/**
 * `?open=` — the entity whose detail drawer is open. It is the single source of
 * truth for the Reportes drill-in (there is no local selection state), so a detail
 * is deep-linkable, survives a reload, and closes on browser Back.
 *
 * The value is `kind:id`, not a bare id: a tab can now open more than one entity
 * kind (Resumen has both a client table and a person table), and a client id and a
 * person id could otherwise collide. The kind is validated against the ACTIVE tab
 * and the id against the current período's dataset, so a stale or cross-tab
 * deep-link resolves to null and the drawer simply does not open.
 */

export type OpenKind = 'person' | 'client' | 'bucket' | 'receivable' | 'payment'
export type OpenRef = { kind: OpenKind; id: string }

const OPEN_KINDS: readonly OpenKind[] = ['person', 'client', 'bucket', 'receivable', 'payment']

/** The Finanzas bucket ids, namespaced by donut: `pending` exists in both Cobros and Pagos. */
function bucketIds(dataset: ReportDataset): string[] {
  const f = dataset.financials
  return [
    ...f.cobrosPorEstado.map((bucket) => `cobros-${bucket.id}`),
    ...f.pagosPorEstado.map((bucket) => `pagos-${bucket.id}`),
    ...f.facturacion.map((bucket) => `facturacion-${bucket.id}`),
    ...f.gastosFijosList.map((line) => `gastos-${line.id}`),
  ]
}

/**
 * The RECORD kinds behind the Finanzas detail tables. Two kinds, four tables: a row of
 * "Cobros por estado" and a row of "Facturación" are the SAME receivable seen through two
 * lenses (collection status vs billing status), and a row of "Gastos fijos" is a payment
 * just like a row of "Pagos por estado". Namespacing them per-table would have invented a
 * distinction the data does not have, and would have made the same record open two
 * different drawers depending on which table you came from.
 */
function receivableIds(dataset: ReportDataset): string[] {
  const f = dataset.financials
  return [...f.cobrosDetail.map((row) => row.id), ...f.facturacionDetail.map((row) => row.id)]
}

function paymentIds(dataset: ReportDataset): string[] {
  const f = dataset.financials
  return [...f.pagosDetail.map((row) => row.id), ...f.gastosFijosList.map((line) => line.id)]
}

/** For each kind, the collection its id must appear in to be valid. */
const ID_SOURCE: Record<OpenKind, (dataset: ReportDataset) => string[]> = {
  person: (dataset) => dataset.capacity.map((person) => person.personId),
  client: (dataset) => dataset.profitability.map((client) => client.clientId),
  bucket: bucketIds,
  receivable: receivableIds,
  payment: paymentIds,
}

/**
 * The entity kinds each tab is allowed to open. Resumen has two tables, hence two.
 *
 * Finanzas has three: the donut `bucket` (a status GROUP) plus the two RECORD kinds its
 * four detail tables list. Those rows used to deep-link out to `/cobros` and `/pagos`,
 * which threw the reader out of the report they were reading — and landed them on an
 * operational page whose period control then covered the record's own header on a phone.
 * They open here now, against the donut and the table they came from, which is the whole
 * point of a drill-in.
 */
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

/** The open entity for this tab, or null when there is none or it is not valid here. */
export function readOpenRef(
  params: URLSearchParams,
  tab: ReportTab,
  dataset: ReportDataset,
): OpenRef | null {
  const raw = params.get('open')
  if (!raw) return null
  // Split on the FIRST colon only: an id may legitimately contain one.
  const separator = raw.indexOf(':')
  if (separator === -1) return null
  const kind = raw.slice(0, separator)
  const id = raw.slice(separator + 1)
  if (!id || !isOpenKind(kind)) return null
  if (!TAB_KINDS[tab].includes(kind)) return null
  return ID_SOURCE[kind](dataset).includes(id) ? { kind, id } : null
}

/** Next params with the entity open. Every other param (tab, trail) is preserved. */
export function withOpenRef(params: URLSearchParams, ref: OpenRef): URLSearchParams {
  const next = new URLSearchParams(params)
  next.set('open', `${ref.kind}:${ref.id}`)
  return next
}

/** Next params with the drawer closed. Every other param (tab, trail) is preserved. */
export function withoutOpenRef(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete('open')
  return next
}
