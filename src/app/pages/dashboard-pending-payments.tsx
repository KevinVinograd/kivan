import { useNavigate } from 'react-router'

import { cn } from '@/app/lib/utils'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { SectionHeader } from '@/app/components/templates'
import { Badge, Card, CardContent } from '@/app/components/components'
import { KpiSummaryCard, type Kpi } from '@/app/components/patterns'
import { DashboardCta, FloatingCardCta } from './dashboard-cta'
import { formatCompactCurrency, formatCurrency, formatShortDate, paymentRowBadge } from './dashboard-format'
import { DASHBOARD_CRUMB } from './dashboard-trail'
import type { PendingPaymentRow, PendingPayments } from './dashboard-types'

const COBROS_CTA_HREF = buildTrailHref('/operacion-mensual?block=clientes', DASHBOARD_CRUMB, new URLSearchParams())

function dueLabel(row: PendingPaymentRow): string {
  if (row.overdueDays != null) return `Vencido hace ${row.overdueDays} días`
  if (row.dueIso) return `Vence ${formatShortDate(row.dueIso)}`
  return 'Sin fecha'
}

function PaymentCard({ row }: { row: PendingPaymentRow }) {
  const navigate = useNavigate()
  const status = paymentRowBadge(row.status)
  const href = buildTrailHref(
    `/operacion-mensual?block=clientes&open=${row.clientId}`,
    DASHBOARD_CRUMB,
    new URLSearchParams(),
  )
  return (
    <Card interactive onClick={() => navigate(href)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className={cn('type-section tabular-nums', row.overdueDays != null ? 'fg-danger' : 'fg-default')}>
            {formatCurrency(row.amount)}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-body-2 fg-default">{row.clientName}</span>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <span className={cn('type-caption', row.overdueDays != null ? 'fg-danger' : 'fg-subtle')}>
            {dueLabel(row)}
          </span>
        </div>
        <FloatingCardCta href={href}>Ver cobro</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

export function PendingPaymentsSummary({ payments }: { payments: PendingPayments }) {
  const kpis: Kpi[] = [
    { id: 'pending', label: 'Total pendiente', value: formatCompactCurrency(payments.totalPending) },
    { id: 'expected', label: 'Total esperado', value: formatCompactCurrency(payments.totalExpected) },
    { id: 'collected', label: 'Total cobrado', value: formatCompactCurrency(payments.totalCollected) },
    {
      id: 'overdue-clients',
      label: 'Clientes vencidos',
      value: String(payments.overdueClients),
      tone: payments.overdueClients > 0 ? 'danger' : 'default',
    },
  ]

  return (
    <section aria-label="Cobros pendientes" className="group/cobros flex flex-col">
      <SectionHeader
        title="Cobros pendientes"
        actions={
          <span className="[@media(hover:hover)]:opacity-0 motion-standard group-hover/cobros:opacity-100 focus-within:opacity-100">
            <DashboardCta href={COBROS_CTA_HREF}>Ver cobros</DashboardCta>
          </span>
        }
      />
      <div className="flex flex-col gap-4 md:gap-6 px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10">
        <KpiSummaryCard figures={kpis} heroId="pending" />
        {payments.rows.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {payments.rows.map((row) => (
              <PaymentCard key={row.clientId} row={row} />
            ))}
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">No hay cobros pendientes en pesos para este mes.</p>
        )}
        {payments.otherLaneCount > 0 ? (
          <p className="type-caption fg-subtle">
            {payments.otherLaneCount === 1
              ? 'Hay 1 cobro del mes en otra moneda, que no se lista acá. Se ve en Cobros.'
              : `Hay ${payments.otherLaneCount} cobros del mes en otra moneda, que no se listan acá. Se ven en Cobros.`}
          </p>
        ) : null}
      </div>
    </section>
  )
}
