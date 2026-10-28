import { Fragment, useMemo, useState, type ReactNode } from 'react'

import {
  Badge,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type BadgeVariant,
} from '@/app/components/components'
import { SectionAccordionCard, SectionHeader } from '@/app/components/templates'
import { ChartContainer, ChartTooltipContent, Cell, Pie, PieChart, Tooltip } from '@/app/components/charts'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import { useIsMobile } from '@/app/lib/use-is-mobile'
import { ReportsTabsHeader, type ReportTab } from './reports-tabs-header'
import { ReportsDetailDrawer } from './reports-detail-drawer'
import { FinanzasBucketDetail, type FinanzasBucketSource } from './finanzas-bucket-detail'
import { FinanzasRecordDetail } from './finanzas-record-detail'
import { ReportEntityLink } from './reports-detail-ui'
import type { OpenRef } from './reports-open-param'
import { DATA_FILL, DATA_PALETTE } from './reports-charts'
import { bucketTone, formatCompactCurrency, formatCurrency, formatShortDate, type KpiTone } from './reports-format'
import { formatMoney } from './cobranza-format'
import type {
  BillingDetailRow,
  CollectionDetailRow,
  FixedExpenseLine,
  PaymentDetailRow,
  ReportDataset,
  StatusBucket,
} from './reports-types'

/**
 * Status tone → data-viz fill, on the SEMANTIC data-state set (not the chromatic
 * identity set): the hue MEANS the state, so settled reads `success` (green),
 * in-flight `warning` (yellow), overdue/errored `danger` (red), and closed
 * `neutral` (gray). Literal `var(--color-data-*)` strings so Tailwind v4's scanner
 * keeps the tokens. Coarse fallback for any status not in `STATUS_FILL`.
 */
const TONE_FILL: Record<KpiTone, string> = {
  default: 'var(--color-data-neutral)',
  success: 'var(--color-data-success)',
  warning: 'var(--color-data-warning)',
  danger: 'var(--color-data-danger)',
}

/**
 * Per-status donut fill on the SEMANTIC data-state set. Each status maps to its
 * state family (success / warning / danger / neutral); when two statuses of the
 * same family can share a single donut, they split across the family's ramp
 * (default vs. `-emphasis`) so adjacent same-hue arcs stay differentiable — e.g.
 * Pagado and Aprobado are both green but read as two distinct greens. At most two
 * same-family statuses co-occur per donut, so default + `-emphasis` suffice; the
 * `-subtle` tier stays available should a family ever grow to three. Literal
 * `var(--color-data-*)` strings (Tailwind v4 scanner); unknown keys fall back to
 * the coarse tone fill.
 */
const STATUS_FILL: Record<string, string> = {
  // Settled → success (green)
  collected: 'var(--color-data-success)',
  paid: 'var(--color-data-success)',
  approved: 'var(--color-data-success-emphasis)', // distinct green vs. paid (pagos)
  invoiced: 'var(--color-data-success)',
  sent: 'var(--color-data-success-emphasis)', // distinct green vs. invoiced (facturación)
  // In-flight → warning (yellow)
  pending: 'var(--color-data-warning)',
  partial: 'var(--color-data-warning-emphasis)', // distinct vs. pending (cobros/pagos)
  no_invoice: 'var(--color-data-warning-emphasis)', // distinct vs. pending (facturación)
  // Overdue / errored → danger (red); never co-occur in one donut, so one tone
  overdue: 'var(--color-data-danger)',
  error_arca: 'var(--color-data-danger)',
  // Closed / neutral → neutral (gray)
  cancelled: 'var(--color-data-neutral)',
  manual: 'var(--color-data-neutral)',
  not_required: 'var(--color-data-neutral-emphasis)', // distinct vs. manual (facturación)
}

/** Status tone → Badge variant for the detail-table Estado cells. */
const TONE_BADGE: Record<KpiTone, BadgeVariant> = {
  default: 'neutral',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
}

/**
 * Risk weight per tone (higher = riskier). Drives the detail table's default
 * "riskiest first" Estado sort (overdue → in-flight → neutral → settled) and the
 * header toggle.
 */
const TONE_RISK: Record<KpiTone, number> = { danger: 3, warning: 2, default: 1, success: 0 }

/** One donut arc + its hover-legend row. */
type DonutSlice = {
  id: string
  label: string
  amount: number
  /** `var(--color-data-*)` fill shared by the arc and the legend dot. */
  fill: string
  /** Optional record count, shown as "· N" in the legend. */
  count?: number
}

/** Map a status-bucket section into donut slices, toned by collection/payment/billing status. */
function statusSlices(buckets: StatusBucket[]): DonutSlice[] {
  return buckets.map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    amount: bucket.amount,
    count: bucket.count,
    fill: STATUS_FILL[bucket.id] ?? TONE_FILL[bucketTone(bucket.id)],
  }))
}

/**
 * Compact donut (center total) whose slices open the status bucket's drawer.
 *
 * It used to reveal its breakdown in a HoverCard; the breakdown now lives in a real
 * drill-in (aging, concentration, period delta), and the complete per-record list stays
 * in the accordion below. A slice is a click target, so it works on touch without a
 * separate mobile branch.
 */
function BucketDonut({
  title,
  slices,
  emptyLabel,
  source,
  onSelect,
}: {
  title: string
  slices: DonutSlice[]
  emptyLabel: string
  source: FinanzasBucketSource
  onSelect: (ref: OpenRef) => void
}) {
  const data = slices.filter((slice) => slice.amount > 0)
  const total = data.reduce((sum, slice) => sum + slice.amount, 0)
  if (total === 0) {
    // A populated donut is the ring (ChartContainer height={168}) PLUS the bucket-button
    // legend under it, so a fixed 168px box no longer matches it. Rather than chase that
    // height with a magic number, the empty state fills whatever the grid row gives it —
    // FinanceDonutCard's `flex-1` Card stretches every cell to the tallest, so the four
    // cards bottom out together whatever each one holds.
    return (
      <div className="flex h-full min-h-[168px] items-center justify-center">
        <p className="type-body-2 fg-subtle">{emptyLabel}</p>
      </div>
    )
  }
  return (
    <div className="relative">
      <ChartContainer
        ariaLabel={`${title}. Total ${formatCurrency(total)}.`}
        height={168}
        grain="ring"
        className="[--donut-grain-inner:50px] [--donut-grain-outer:74px]"
      >
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="label"
            innerRadius={50}
            outerRadius={74}
            paddingAngle={2}
            strokeWidth={0}
            startAngle={90}
            endAngle={-270}
            onClick={(_, index) => onSelect({ kind: 'bucket', id: `${source}-${data[index].id}` })}
          >
            {data.map((slice) => (
              <Cell key={slice.id} fill={slice.fill} className="cursor-pointer" />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltipContent formatValue={(value) => formatCurrency(value)} />} />
        </PieChart>
      </ChartContainer>
      <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {/* Uniform center total across the 4 peer donuts — Cobros leads by position,
            not by an enlarged center (identical charts must not fake a size hero). */}
        <span className="type-section tabular-nums fg-default">{formatCompactCurrency(total)}</span>
        <span className="type-caption fg-subtle">Total</span>
      </span>
      {/* Keyboard path: a slice is an SVG path and cannot take focus, so the buckets are
          also reachable as a row of buttons below the ring. Color is never the only signal. */}
      <ul className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.map((slice) => (
          <li key={slice.id}>
            <button
              type="button"
              onClick={() => onSelect({ kind: 'bucket', id: `${source}-${slice.id}` })}
              className="flex items-center gap-1 rounded-control type-caption fg-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <svg viewBox="0 0 8 8" className="size-2 shrink-0" aria-hidden>
                <circle cx="4" cy="4" r="4" fill={slice.fill} />
              </svg>
              {slice.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One donut card: a section title over the donut. */
function FinanceDonutCard({
  title,
  slices,
  emptyLabel,
  source,
  onSelect,
}: {
  title: string
  slices: DonutSlice[]
  emptyLabel: string
  source: FinanzasBucketSource
  onSelect: (ref: OpenRef) => void
}) {
  return (
    <div className="flex flex-col">
      <SectionHeader title={title} inset={false} />
      {/* `flex-1` lets the card fill its stretched grid cell, so the four cards in the row
          bottom out together however many buckets each donut's legend holds — and an empty
          donut no longer sits shorter than its populated peers. */}
      <Card className="flex-1">
        <CardContent className="h-full">
          <BucketDonut
            title={title}
            slices={slices}
            emptyLabel={emptyLabel}
            source={source}
            onSelect={onSelect}
          />
        </CardContent>
      </Card>
    </div>
  )
}

type SortDir = 'asc' | 'desc'

type DetailColumn<T> = {
  id: string
  header: string
  alignRight?: boolean
  cell: (row: T) => ReactNode
  /** Set only on the sortable Estado column; higher = riskier. Marks it sortable. */
  risk?: (row: T) => number
}

/** Direction caret for the active (Estado) sort, from the registered sort affordances. */
function SortIcon({ dir }: { dir: SortDir }) {
  const Glyph = dir === 'asc' ? AFFORDANCE.sortAscending : AFFORDANCE.sortDescending
  return <Glyph className="size-3.5 fg-subtle" />
}

/**
 * Read-only detail table on the governed Table primitive. The Estado column is
 * sortable by status risk — it defaults to riskiest-first and toggles on the
 * header button (consumer-owned sort state, per the Table rule). Rows arrive
 * pre-sorted by amount (desc); JS's stable sort keeps that order within an
 * equal-risk group, so amount is the natural tiebreak.
 */
function DetailTable<T extends { id: string }>({
  label,
  columns,
  rows,
  onOpen,
}: {
  label: string
  columns: DetailColumn<T>[]
  rows: T[]
  /**
   * Open that record's detail — IN PLACE, in this page's drawer.
   *
   * This used to be `hrefOf`, a deep link out to `/cobros` or `/pagos`. It threw the reader
   * out of the report they were reading, to answer a question about a row of it. A drill-in
   * is read AGAINST the aggregate it came from; navigating away destroys the only context
   * that made it worth opening. It now selects into the same `?open=` drawer every other
   * Reportes table uses, so the URL still carries the open record (shareable, reload-safe,
   * closed by Back) without changing the page under the reader.
   */
  onOpen: (row: T) => void
}) {
  const isMobile = useIsMobile()
  const [dir, setDir] = useState<SortDir>('desc')
  const sortColumn = columns.find((column) => column.risk)
  const sorted = useMemo(() => {
    const risk = sortColumn?.risk
    if (!risk) return rows
    return [...rows].sort((a, b) => (dir === 'desc' ? risk(b) - risk(a) : risk(a) - risk(b)))
  }, [rows, dir, sortColumn])

  // Phones: each row becomes a compact two-line card (title + amounts and the Estado badge),
  // still pre-sorted riskiest-first. The whole card is the target — it opens the record's
  // drawer on this page. It was an anchor while it navigated away; now that it selects into
  // the page's own drawer there is nowhere to link TO, so it takes the same whole-row
  // `role="button"` idiom every other in-place Reportes list uses (`resumen-mobile-lists`).
  if (isMobile) {
    const titleColumn = columns[0]
    const badgeColumn = sortColumn
    const secondaryColumns = columns.filter(
      (column, index) => index !== 0 && column !== badgeColumn,
    )
    return (
      <ul className="flex flex-col" aria-label={label}>
        {sorted.map((row) => (
          <li key={row.id} className="border-b border-alpha-subtle last:border-b-0">
            <div
              role="button"
              tabIndex={0}
              onClick={() => onOpen(row)}
              onKeyDown={(event) => {
                // Only keys aimed at the row itself open it. Nothing inside the row is
                // focusable today, so this is a no-op — but it is the guard the same idiom
                // needed in `data-table` and `resumen-mobile-lists`, where an overflow menu
                // inside the row DID bubble its Enter up and yank the drawer open behind it.
                // Cheap here, and it stops the next person who adds a control to this row
                // from rediscovering that bug.
                if (event.target !== event.currentTarget) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpen(row)
                }
              }}
              className="motion-standard flex cursor-pointer items-start justify-between gap-3 rounded-control px-2 py-3 outline-none hover:bg-alpha-subtle-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="min-w-0 type-body-2 font-medium fg-default">
                  {titleColumn.cell(row)}
                </div>
                {secondaryColumns.length > 0 || badgeColumn ? (
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 type-caption fg-subtle">
                    {secondaryColumns.map((column, index) => (
                      <Fragment key={column.id}>
                        {index > 0 ? (
                          <span aria-hidden className="fg-subtle">
                            ·
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          {column.cell(row)}
                        </span>
                      </Fragment>
                    ))}
                    {badgeColumn ? (
                      <span className="ms-auto inline-flex items-center">
                        {badgeColumn.cell(row)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Table aria-label={label}>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead
              key={column.id}
              scope="col"
              aria-sort={column.risk ? (dir === 'desc' ? 'descending' : 'ascending') : undefined}
              className={column.alignRight ? 'text-right' : undefined}
            >
              {column.risk ? (
                <button
                  type="button"
                  onClick={() => setDir((current) => (current === 'desc' ? 'asc' : 'desc'))}
                  className="-mx-1 inline-flex items-center gap-1 rounded-control px-1 py-0.5 font-medium select-none hover:bg-alpha-subtle-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {column.header}
                  <SortIcon dir={dir} />
                </button>
              ) : (
                column.header
              )}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => (
          // The whole row is the mouse target; the name in the first cell is the KEYBOARD
          // one. Both are needed: `TableRow interactive` adds `cursor-pointer` and nothing
          // else — no tabIndex, no role, no onKeyDown — so a `<tr onClick>` is unreachable
          // from the keyboard. The first cell used to carry a `<Link>` for exactly this
          // reason; with the destination now on this page there is nothing to link TO, so it
          // becomes `ReportEntityLink`, the button every other Reportes table already uses as
          // its entity trigger. It stops its own propagation, so clicking the name fires the
          // drawer once, not twice.
          <TableRow key={row.id} interactive onClick={() => onOpen(row)}>
            {columns.map((column, index) => (
              <TableCell key={column.id} className={column.alignRight ? 'text-right' : undefined}>
                {index === 0 ? (
                  <ReportEntityLink name={column.cell(row)} onOpen={() => onOpen(row)} />
                ) : (
                  column.cell(row)
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** Collapsed-only trailing summary: per-status amounts, hidden once the item opens. */
function CollapsedSummary({ items }: { items: { id: string; label: string; amount: number }[] }) {
  if (items.length === 0) return null
  // Left-aligned on a phone, where the card stacks this under the title (it is no longer
  // a trailing column, so trailing alignment would read as an orphan); right-aligned from
  // `md`, where it returns to the trigger's trailing edge.
  return (
    <span className="flex flex-wrap items-center justify-start gap-x-3 gap-y-1 md:justify-end [[data-state=open]_&]:hidden">
      {items.map((item) => (
        <span key={item.id} className="type-caption fg-subtle">
          {item.label} <span className="tabular-nums fg-default">{formatCompactCurrency(item.amount)}</span>
        </span>
      ))}
    </span>
  )
}

/** One detail section as its own titled card: title + collapsed summary in the
 *  header, detail table in the body. */
function DetailAccordionItem<T extends { id: string }>({
  value,
  title,
  summary,
  columns,
  rows,
  onOpen,
  emptyLabel,
}: {
  value: string
  title: string
  summary: { id: string; label: string; amount: number }[]
  columns: DetailColumn<T>[]
  rows: T[]
  onOpen: (row: T) => void
  emptyLabel: string
}) {
  return (
    <SectionAccordionCard
      value={value}
      title={title}
      summary={<CollapsedSummary items={summary} />}
      // Up to four labelled amounts. Inline on a phone they squeeze into a narrow
      // trailing column and wrap to four stacked lines, which drags the title into
      // wrapping too; below `md` they read under the title instead.
      stackSummaryOnMobile
    >
      {rows.length > 0 ? (
        <DetailTable label={title} columns={columns} rows={rows} onOpen={onOpen} />
      ) : (
        <p className="type-body-2 fg-subtle">{emptyLabel}</p>
      )}
    </SectionAccordionCard>
  )
}

/** Per-status amounts for a collapsed summary (skips empty buckets). */
function bucketSummary(buckets: StatusBucket[]) {
  return buckets.filter((bucket) => bucket.amount > 0).map((bucket) => ({ id: bucket.id, label: bucket.label, amount: bucket.amount }))
}

const statusBadge = (statusKey: string, label: string) => (
  <Badge variant={TONE_BADGE[bucketTone(statusKey)]}>{label}</Badge>
)

const cobrosColumns: DetailColumn<CollectionDetailRow>[] = [
  { id: 'cliente', header: 'Cliente', cell: (row) => row.clientName },
  { id: 'servicio', header: 'Servicio', cell: (row) => <span className="fg-subtle">{row.service}</span> },
  { id: 'vence', header: 'Vence', cell: (row) => <span className="fg-subtle">{formatShortDate(row.dueDate)}</span> },
  { id: 'estado', header: 'Estado', cell: (row) => statusBadge(row.status, row.statusLabel), risk: (row) => TONE_RISK[bucketTone(row.status)] },
  { id: 'monto', header: 'Monto', alignRight: true, cell: (row) => <span className="tabular-nums">{formatMoney(row.totalAmount, row.currency)}</span> },
  { id: 'cobrado', header: 'Cobrado', alignRight: true, cell: (row) => <span className="tabular-nums fg-subtle">{formatMoney(row.collectedAmount, row.currency)}</span> },
]

const pagosColumns: DetailColumn<PaymentDetailRow>[] = [
  { id: 'destinatario', header: 'Destinatario', cell: (row) => row.recipientName },
  { id: 'concepto', header: 'Concepto', cell: (row) => <span className="fg-subtle">{row.concept}</span> },
  { id: 'estado', header: 'Estado', cell: (row) => statusBadge(row.status, row.statusLabel), risk: (row) => TONE_RISK[bucketTone(row.status)] },
  { id: 'monto', header: 'Monto', alignRight: true, cell: (row) => <span className="tabular-nums">{formatMoney(row.totalAmount, row.currency)}</span> },
  { id: 'pagado', header: 'Pagado', alignRight: true, cell: (row) => <span className="tabular-nums fg-subtle">{formatMoney(row.paidAmount, row.currency)}</span> },
]

const facturacionColumns: DetailColumn<BillingDetailRow>[] = [
  { id: 'cliente', header: 'Cliente', cell: (row) => row.clientName },
  { id: 'estado', header: 'Estado de factura', cell: (row) => statusBadge(row.billingStatus, row.billingLabel), risk: (row) => TONE_RISK[bucketTone(row.billingStatus)] },
  { id: 'monto', header: 'Monto', alignRight: true, cell: (row) => <span className="tabular-nums">{formatMoney(row.totalAmount, row.currency)}</span> },
]

const gastosColumns: DetailColumn<FixedExpenseLine>[] = [
  { id: 'concepto', header: 'Concepto', cell: (row) => row.concept },
  { id: 'estado', header: 'Estado', cell: (row) => <Badge variant={row.paid ? 'success' : 'warning'}>{row.paid ? 'Pagado' : 'Pendiente'}</Badge>, risk: (row) => (row.paid ? TONE_RISK.success : TONE_RISK.warning) },
  { id: 'monto', header: 'Monto', alignRight: true, cell: (row) => <span className="tabular-nums">{formatMoney(row.amount, row.currency)}</span> },
]

/**
 * Finanzas operativas tab (§5): a read-only financial analysis of the período.
 * Top tier — four donut cards in one row (cobros / pagos by state, facturación,
 * fixed expenses), each a center total whose slices drill into the Estado financiero
 * drawer (aging, concentration, period delta). Below — a collapsible accordion whose
 * expanded body is a per-record detail table (Estado sortable, riskiest-first) and
 * whose collapsed header carries a per-status amount summary. No invoicing or money
 * mutations; the tab links out to the operational modules.
 */
export function FinanzasTab({
  dataset,
  previousDataset,
  selectedRef,
  onSelect,
  onClose,
  activeTab,
  onTabChange,
}: {
  dataset: ReportDataset
  previousDataset: ReportDataset | null
  selectedRef: OpenRef | null
  onSelect: (ref: OpenRef) => void
  onClose: () => void
  activeTab: ReportTab
  onTabChange: (tab: ReportTab) => void
}) {
  const financials = dataset.financials

  // Gastos fijos has no collection status — slice by concept, toned by settlement.
  const gastosSlices: DonutSlice[] = financials.gastosFijosList.map((line, index) => ({
    id: line.id,
    label: line.concept,
    amount: line.amount,
    // Sliced by concept (no status), so each concept gets a distinct categorical color.
    fill: DATA_FILL[DATA_PALETTE[index % DATA_PALETTE.length]],
  }))
  const gastosSummary = [
    { id: 'paid', label: 'Pagado', amount: financials.gastosFijosList.filter((line) => line.paid).reduce((sum, line) => sum + line.amount, 0) },
    { id: 'pending', label: 'Pendiente', amount: financials.gastosFijosList.filter((line) => !line.paid).reduce((sum, line) => sum + line.amount, 0) },
  ].filter((item) => item.amount > 0)

  // Pre-sort detail rows by amount (desc) so the Estado risk-sort tiebreaks by amount.
  const cobrosRows = [...financials.cobrosDetail].sort((a, b) => b.totalAmount - a.totalAmount)
  const pagosRows = [...financials.pagosDetail].sort((a, b) => b.totalAmount - a.totalAmount)
  const facturacionRows = [...financials.facturacionDetail].sort((a, b) => b.totalAmount - a.totalAmount)
  const gastosRows = [...financials.gastosFijosList].sort((a, b) => b.amount - a.amount)

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <ReportsTabsHeader activeTab={activeTab} onTabChange={onTabChange} />

      {/* Everything on this tab is the peso lane — the totals, the donuts and the tables
          alike. A dollar cannot be added to a peso, and every figure here wears a peso
          "$". What that leaves out is named rather than folded in at face value. */}
      {financials.otherLaneCount > 0 ? (
        <p className="type-caption fg-subtle px-4 md:px-6 lg:px-8 desktop:px-10">
          {financials.otherLaneCount === 1
            ? 'Hay 1 operación del mes en otra moneda, que no entra en estos totales ni en estas tablas. Se ve en Cobros o en Pagos.'
            : `Hay ${financials.otherLaneCount} operaciones del mes en otra moneda, que no entran en estos totales ni en estas tablas. Se ven en Cobros o en Pagos.`}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:gap-6 px-4 md:px-6 lg:px-8 desktop:px-10 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceDonutCard title="Cobros por estado" slices={statusSlices(financials.cobrosPorEstado)} emptyLabel="Sin movimientos en el período" source="cobros" onSelect={onSelect} />
        <FinanceDonutCard title="Pagos por estado" slices={statusSlices(financials.pagosPorEstado)} emptyLabel="Sin movimientos en el período" source="pagos" onSelect={onSelect} />
        <FinanceDonutCard title="Facturación" slices={statusSlices(financials.facturacion)} emptyLabel="Sin movimientos en el período" source="facturacion" onSelect={onSelect} />
        <FinanceDonutCard title="Gastos fijos" slices={gastosSlices} emptyLabel="Sin gastos fijos en el período" source="gastos" onSelect={onSelect} />
      </div>

      <div className="flex flex-col px-4 md:px-6 lg:px-8 desktop:px-10">
        <div className="flex flex-col gap-4 md:gap-6">
          <DetailAccordionItem
            value="cobros"
            title="Cobros por estado"
            summary={bucketSummary(financials.cobrosPorEstado)}
            columns={cobrosColumns}
            rows={cobrosRows}
            onOpen={(row) => onSelect({ kind: 'receivable', id: row.id })}
            emptyLabel="Sin movimientos en el período"
          />
          <DetailAccordionItem
            value="pagos"
            title="Pagos por estado"
            summary={bucketSummary(financials.pagosPorEstado)}
            columns={pagosColumns}
            rows={pagosRows}
            onOpen={(row) => onSelect({ kind: 'payment', id: row.id })}
            emptyLabel="Sin movimientos en el período"
          />
          <DetailAccordionItem
            value="facturacion"
            title="Facturación"
            summary={bucketSummary(financials.facturacion)}
            columns={facturacionColumns}
            rows={facturacionRows}
            onOpen={(row) => onSelect({ kind: 'receivable', id: row.id })}
            emptyLabel="Sin movimientos en el período"
          />
          <DetailAccordionItem
            value="gastos"
            title="Gastos fijos"
            summary={gastosSummary}
            columns={gastosColumns}
            rows={gastosRows}
            onOpen={(row) => onSelect({ kind: 'payment', id: row.id })}
            emptyLabel="Sin gastos fijos en el período"
          />
        </div>
      </div>

      {/* One drawer, three kinds. `bucket` is a status GROUP (from a donut slice);
          `receivable` and `payment` are the RECORDS the four detail tables list, which used
          to deep-link out to /cobros and /pagos and take the reader off the report with them.
          The drawer's title follows the kind — "Detalle del estado" would be a lie over a
          single receivable. */}
      <ReportsDetailDrawer
        title={selectedRef?.kind === 'bucket' ? 'Detalle del estado' : 'Detalle del registro'}
        detail={
          selectedRef?.kind === 'bucket' ? (
            <FinanzasBucketDetail
              bucketId={selectedRef.id}
              dataset={dataset}
              previousDataset={previousDataset}
              onClose={onClose}
            />
          ) : selectedRef?.kind === 'receivable' || selectedRef?.kind === 'payment' ? (
            <FinanzasRecordDetail
              kind={selectedRef.kind}
              id={selectedRef.id}
              dataset={dataset}
              onClose={onClose}
            />
          ) : null
        }
        onClose={onClose}
      />
    </div>
  )
}
