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

// The dashboard is the trail root, so every CTA href carries a back-trail crumb
// to the dashboard (no inbound trail to forward — `new URLSearchParams()`).
const COBROS_CTA_HREF = buildTrailHref('/operacion-mensual?block=clientes', DASHBOARD_CRUMB, new URLSearchParams())

function dueLabel(row: PendingPaymentRow): string {
  if (row.overdueDays != null) return `Vencido hace ${row.overdueDays} días`
  if (row.dueIso) return `Vence ${formatShortDate(row.dueIso)}`
  return 'Sin fecha'
}

function PaymentCard({ row }: { row: PendingPaymentRow }) {
  const navigate = useNavigate()
  const status = paymentRowBadge(row.status)
  // Deep-link into Operación mensual: open this client's cobro detail and carry a
  // Dashboard crumb so the target shows a back-to-dashboard trail.
  const href = buildTrailHref(
    `/operacion-mensual?block=clientes&open=${row.clientId}`,
    DASHBOARD_CRUMB,
    new URLSearchParams(),
  )
  return (
    <Card interactive onClick={() => navigate(href)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          {/* Primary: the amount owed — what this card exists to surface. */}
          <span className={cn('type-section tabular-nums', row.overdueDays != null ? 'fg-danger' : 'fg-default')}>
            {formatCurrency(row.amount)}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          {/* Secondary: who owes it + payment state. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-body-2 fg-default">{row.clientName}</span>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          {/* Tertiary: since when. */}
          <span className={cn('type-caption', row.overdueDays != null ? 'fg-danger' : 'fg-subtle')}>
            {dueLabel(row)}
          </span>
        </div>
        <FloatingCardCta href={href}>Ver cobro</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

/**
 * §6 Cobros pendientes. The expected/collected/pending totals plus up to five
 * clients that need payment attention (one card each, mirroring Clientes en
 * riesgo, with a hover/focus "Ver cobro" deep-link). It is a summary, not the
 * full payment management table.
 */
export function PendingPaymentsSummary({ payments }: { payments: PendingPayments }) {
  // §6 focal → Total pendiente (money still owed this month). The context figures follow;
  // only `Clientes vencidos` carries status, and only when there is something overdue.
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
      {/* "Ver cobros" is hidden on hover-capable pointers and fades in (motion-standard)
          when the mouse enters the section or the button takes keyboard focus; on touch it
          stays visible. The action keeps to the title row, far right, at every width. */}
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
        {/* The cards carry amounts, so they are the peso lane. The tile above counts every
            lane, because an overdue cobro is overdue whatever it is billed in — this is
            what keeps the two from looking like a contradiction. */}
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
