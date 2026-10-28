import { useNavigate } from 'react-router'
import { endOfMonth, format, parseISO } from 'date-fns'

import { Button, Card, CardContent } from '@/app/components/components'
import { AgingBarChart } from './reports-charts'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { FINANZAS_CRUMB } from './reports-trail'
import { ReportDetailRow, ReportDetailSection, ReportDetailShell, ReportFiguresCard } from './reports-detail-ui'
import { agingBuckets, concentration } from './reports-aggregations'
import { formatCurrency, formatPercent } from './reports-format'
import type { ReportDataset, StatusBucket } from './reports-types'

/** Which donut a bucket ref came from. Ids are namespaced because `pending` exists in more than one. */
export type FinanzasBucketSource = 'cobros' | 'pagos' | 'facturacion' | 'gastos'

/** Records with a due date, ranked by debtor — everything the drawer needs from a bucket. */
type BucketRows = {
  /** Records in this bucket, with a due date when the concept has one. */
  dated: { dueDate: string; totalAmount: number }[]
  /** Records in this bucket, by counterparty name. */
  named: { name: string; amount: number }[]
  /** Whether aging is meaningful here (cobros / pagos only). */
  ageable: boolean
  /** Where "Ver todos" goes. */
  href: string
}

const SOURCE_LABEL: Record<FinanzasBucketSource, string> = {
  cobros: 'Cobros',
  pagos: 'Pagos',
  facturacion: 'Facturación',
  gastos: 'Gastos fijos',
}

/** Split `cobros-overdue` into its source and its status key. */
function parseBucketId(bucketId: string): { source: FinanzasBucketSource; status: string } | null {
  const separator = bucketId.indexOf('-')
  if (separator === -1) return null
  const source = bucketId.slice(0, separator)
  const status = bucketId.slice(separator + 1)
  if (source !== 'cobros' && source !== 'pagos' && source !== 'facturacion' && source !== 'gastos') return null
  if (!status) return null
  return { source, status }
}

/** The bucket's own StatusBucket, and the donut it belongs to (for the share-of-total figure). */
function findBucket(
  dataset: ReportDataset,
  source: FinanzasBucketSource,
  status: string,
): { bucket: StatusBucket; siblings: StatusBucket[] } | null {
  const f = dataset.financials
  const donut: Record<FinanzasBucketSource, StatusBucket[]> = {
    cobros: f.cobrosPorEstado,
    pagos: f.pagosPorEstado,
    facturacion: f.facturacion,
    gastos: f.gastosFijosList.map((line) => ({
      id: line.id,
      label: line.concept,
      count: 1,
      amount: line.amount,
    })),
  }
  const siblings = donut[source]
  const bucket = siblings.find((entry) => entry.id === status)
  return bucket ? { bucket, siblings } : null
}

/**
 * The records behind a bucket.
 *
 * The CTA carries only `?period=`, which `cobranza-page` actually reads (it seeds the
 * destination's period so an off-current record resolves in its list). It deliberately
 * does NOT carry a `?status=` / `?billing=` filter: no page in the app reads one, so
 * appending it would put a filter in the URL that is silently dropped and land the
 * reader on the full list while implying it was narrowed. Seeding the destination's
 * column filter is a change to `cobranza-page`, not to this drawer; until that exists,
 * the honest destination is the period's list.
 */
function rowsFor(dataset: ReportDataset, source: FinanzasBucketSource, status: string): BucketRows {
  const f = dataset.financials
  const period = `?period=${f.period}`
  if (source === 'cobros') {
    const rows = f.cobrosDetail.filter((row) => row.status === status)
    return {
      dated: rows.map((row) => ({ dueDate: row.dueDate, totalAmount: row.totalAmount })),
      named: rows.map((row) => ({ name: row.clientName, amount: row.totalAmount })),
      ageable: true,
      href: `/cobros${period}`,
    }
  }
  if (source === 'pagos') {
    const rows = f.pagosDetail.filter((row) => row.status === status)
    return {
      dated: rows.map((row) => ({ dueDate: row.expectedDate, totalAmount: row.totalAmount })),
      named: rows.map((row) => ({ name: row.recipientName, amount: row.totalAmount })),
      ageable: true,
      href: `/pagos${period}`,
    }
  }
  if (source === 'facturacion') {
    const rows = f.facturacionDetail.filter((row) => row.billingStatus === status)
    return {
      dated: [],
      named: rows.map((row) => ({ name: row.clientName, amount: row.totalAmount })),
      // Billing state is not "money late" — a not-yet-invoiced receivable has no age.
      ageable: false,
      href: `/cobros${period}`,
    }
  }
  const line = f.gastosFijosList.find((entry) => entry.id === status)
  return {
    dated: [],
    named: line ? [{ name: line.concept, amount: line.amount }] : [],
    ageable: false,
    href: `/pagos${period}`,
  }
}

/** Last day of the período — the reference date all aging is measured against. */
function periodEnd(period: string): string {
  return format(endOfMonth(parseISO(period)), 'yyyy-MM-dd')
}

/**
 * Estado financiero detail (§5) — the analysis of one status bucket: how much of the
 * donut it is, how old the money is, how concentrated it is in a few counterparties,
 * and how it moved against the prior período.
 *
 * This is the only cash-risk lens in the product: nothing else anywhere ages a debt.
 * The accordion below the donuts stays untouched — it is the complete, per-record list;
 * this is the lens over it.
 */
export function FinanzasBucketDetail({
  bucketId,
  dataset,
  previousDataset,
  onClose,
}: {
  bucketId: string | null
  dataset: ReportDataset
  previousDataset: ReportDataset | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  if (!bucketId) return null
  const parsed = parseBucketId(bucketId)
  if (!parsed) return null
  const found = findBucket(dataset, parsed.source, parsed.status)
  if (!found) return null

  const { bucket, siblings } = found
  const rows = rowsFor(dataset, parsed.source, parsed.status)
  const donutTotal = siblings.reduce((sum, entry) => sum + entry.amount, 0)
  const share = donutTotal > 0 ? (bucket.amount / donutTotal) * 100 : 0

  const aging = rows.ageable ? agingBuckets(rows.dated, periodEnd(dataset.period)) : []
  const overdueTotal = aging.reduce((sum, band) => sum + band.amount, 0)
  const worstBand = aging.reduce<string | null>(
    (worst, band) => (band.amount > 0 ? band.id : worst),
    null,
  )

  const top = concentration(rows.named, (row) => row.name, (row) => row.amount, 5)

  // An ABSENT bucket in the prior período means the amount was ZERO, not that the data is
  // missing: `bucketBy` only emits a bucket for a status that actually occurred. Reporting
  // "sin dato" there would hide the single most alarming case — a pile of overdue money
  // that did not exist last month. Only the oldest período, which has no prior dataset at
  // all, is genuinely without data.
  const previousAmount = previousDataset
    ? (findBucket(previousDataset, parsed.source, parsed.status)?.bucket.amount ?? 0)
    : null
  const deltaAmount = previousAmount === null ? null : bucket.amount - previousAmount
  const deltaPercent =
    previousAmount !== null && previousAmount !== 0
      ? ((bucket.amount - previousAmount) / previousAmount) * 100
      : null

  return (
    <ReportDetailShell
      title={bucket.label}
      subtitle={SOURCE_LABEL[parsed.source]}
      onClose={onClose}
    >
      <ReportFiguresCard
        figures={[
          // The amount is the drawer's focal figure. It is NOT tinted: the status is
          // already carried by the bucket's own label and by the aging band below, and
          // double-encoding it on the number is exactly what figure-color-restraint bans.
          { label: 'Monto', value: formatCurrency(bucket.amount), emphasis: 'hero' },
          { label: 'Registros', value: String(bucket.count) },
        ]}
      />

      <ReportDetailSection title="Peso en el total">
        <ReportDetailRow label={`Sobre ${SOURCE_LABEL[parsed.source]}`} value={formatPercent(share)} />
        <ReportDetailRow label="Total del período" value={formatCurrency(donutTotal)} />
      </ReportDetailSection>

      {rows.ageable ? (
        <section className="flex flex-col gap-2">
          <h3 className="type-caption fg-subtle">Antigüedad</h3>
          <Card>
            <CardContent className="flex flex-col gap-2">
              {overdueTotal > 0 ? (
                <AgingBarChart
                  data={aging}
                  ariaLabel={`Antigüedad de ${bucket.label} en ${SOURCE_LABEL[parsed.source]}`}
                  formatValue={(value) => formatCurrency(value)}
                />
              ) : (
                <p className="px-2 py-6 text-center type-caption fg-subtle">
                  Sin registros vencidos al cierre del período
                </p>
              )}
              {worstBand === '90+' ? (
                <p className="type-caption fg-subtle tabular-nums">
                  {formatCurrency(aging[3].amount)} con más de 90 días de atraso
                </p>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : null}

      <ReportDetailSection title="Concentración">
        {top.top.length > 0 ? (
          <>
            <ReportDetailRow
              label={`Top ${top.top.length} sobre el total`}
              value={formatPercent(top.topShare)}
            />
            {top.top.map((entry) => (
              <ReportDetailRow key={entry.name} label={entry.name} value={formatCurrency(entry.amount)} />
            ))}
          </>
        ) : (
          <span className="type-body-2 fg-subtle">Sin registros en el período</span>
        )}
      </ReportDetailSection>

      <ReportDetailSection title="Comparativa con el período anterior">
        {deltaAmount === null || previousAmount === null ? (
          <span className="type-body-2 fg-subtle">Sin dato del período anterior</span>
        ) : (
          <>
            <ReportDetailRow
              label="Variación"
              value={`${deltaAmount >= 0 ? '+' : ''}${formatCurrency(deltaAmount)}`}
            />
            <ReportDetailRow
              label="Variación relativa"
              value={
                deltaPercent === null
                  ? // Zero last período: the bucket is new. A percent change from zero is
                    // undefined, so say what happened instead of hiding it behind a dash.
                    'Nuevo en el período'
                  : `${deltaPercent >= 0 ? '+' : ''}${Math.round(deltaPercent)}%`
              }
            />
            <ReportDetailRow label="Período anterior" value={formatCurrency(previousAmount)} />
          </>
        )}
      </ReportDetailSection>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outlined"
          color="primary"
          onClick={() => navigate(buildTrailHref(rows.href, FINANZAS_CRUMB, new URLSearchParams()))}
        >
          Ver en {SOURCE_LABEL[parsed.source]}
        </Button>
      </div>
    </ReportDetailShell>
  )
}
