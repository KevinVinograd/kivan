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

export type FinanzasBucketSource = 'cobros' | 'pagos' | 'facturacion' | 'gastos'

type BucketRows = {
  dated: { dueDate: string; totalAmount: number }[]
  named: { name: string; amount: number }[]
  ageable: boolean
  href: string
}

const SOURCE_LABEL: Record<FinanzasBucketSource, string> = {
  cobros: 'Cobros',
  pagos: 'Pagos',
  facturacion: 'Facturación',
  gastos: 'Gastos fijos',
}

function parseBucketId(bucketId: string): { source: FinanzasBucketSource; status: string } | null {
  const separator = bucketId.indexOf('-')
  if (separator === -1) return null
  const source = bucketId.slice(0, separator)
  const status = bucketId.slice(separator + 1)
  if (source !== 'cobros' && source !== 'pagos' && source !== 'facturacion' && source !== 'gastos') return null
  if (!status) return null
  return { source, status }
}

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

function periodEnd(period: string): string {
  return format(endOfMonth(parseISO(period)), 'yyyy-MM-dd')
}

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
                  ?
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
