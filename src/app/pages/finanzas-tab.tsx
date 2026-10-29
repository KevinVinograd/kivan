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

const TONE_FILL: Record<KpiTone, string> = {
  default: 'var(--color-data-neutral)',
  success: 'var(--color-data-success)',
  warning: 'var(--color-data-warning)',
  danger: 'var(--color-data-danger)',
}

const STATUS_FILL: Record<string, string> = {
  collected: 'var(--color-data-success)',
  paid: 'var(--color-data-success)',
  approved: 'var(--color-data-success-emphasis)',
  invoiced: 'var(--color-data-success)',
  sent: 'var(--color-data-success-emphasis)',
  pending: 'var(--color-data-warning)',
  partial: 'var(--color-data-warning-emphasis)',
  no_invoice: 'var(--color-data-warning-emphasis)',
  overdue: 'var(--color-data-danger)',
  error_arca: 'var(--color-data-danger)',
  cancelled: 'var(--color-data-neutral)',
  manual: 'var(--color-data-neutral)',
  not_required: 'var(--color-data-neutral-emphasis)',
}

const TONE_BADGE: Record<KpiTone, BadgeVariant> = {
  default: 'neutral',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
}

const TONE_RISK: Record<KpiTone, number> = { danger: 3, warning: 2, default: 1, success: 0 }

type DonutSlice = {
  id: string
  label: string
  amount: number
  fill: string
  count?: number
}

function statusSlices(buckets: StatusBucket[]): DonutSlice[] {
  return buckets.map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    amount: bucket.amount,
    count: bucket.count,
    fill: STATUS_FILL[bucket.id] ?? TONE_FILL[bucketTone(bucket.id)],
  }))
}

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
        <span className="type-section tabular-nums fg-default">{formatCompactCurrency(total)}</span>
        <span className="type-caption fg-subtle">Total</span>
      </span>
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
  risk?: (row: T) => number
}

function SortIcon({ dir }: { dir: SortDir }) {
  const Glyph = dir === 'asc' ? AFFORDANCE.sortAscending : AFFORDANCE.sortDescending
  return <Glyph className="size-3.5 fg-subtle" />
}

function DetailTable<T extends { id: string }>({
  label,
  columns,
  rows,
  onOpen,
}: {
  label: string
  columns: DetailColumn<T>[]
  rows: T[]
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

function CollapsedSummary({ items }: { items: { id: string; label: string; amount: number }[] }) {
  if (items.length === 0) return null
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

  const gastosSlices: DonutSlice[] = financials.gastosFijosList.map((line, index) => ({
    id: line.id,
    label: line.concept,
    amount: line.amount,
    fill: DATA_FILL[DATA_PALETTE[index % DATA_PALETTE.length]],
  }))
  const gastosSummary = [
    { id: 'paid', label: 'Pagado', amount: financials.gastosFijosList.filter((line) => line.paid).reduce((sum, line) => sum + line.amount, 0) },
    { id: 'pending', label: 'Pendiente', amount: financials.gastosFijosList.filter((line) => !line.paid).reduce((sum, line) => sum + line.amount, 0) },
  ].filter((item) => item.amount > 0)

  const cobrosRows = [...financials.cobrosDetail].sort((a, b) => b.totalAmount - a.totalAmount)
  const pagosRows = [...financials.pagosDetail].sort((a, b) => b.totalAmount - a.totalAmount)
  const facturacionRows = [...financials.facturacionDetail].sort((a, b) => b.totalAmount - a.totalAmount)
  const gastosRows = [...financials.gastosFijosList].sort((a, b) => b.amount - a.amount)

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <ReportsTabsHeader activeTab={activeTab} onTabChange={onTabChange} />

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
