import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Avatar, AvatarFallback, Badge, Card, CardContent } from '@/app/components/components'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { DashboardCta, FloatingCardCta } from './dashboard-cta'
import { initials } from './clients-format'
import { formatCompactCurrency, formatCurrency, teamPayStatusBadge } from './admin-dashboard-format'
import { MetricTile } from './admin-dashboard-ui'
import type { TeamPayments, TeamPayRow } from './admin-dashboard-types'

const TEAM_PAYMENTS_CTA_HREF = buildTrailHref(
  '/operacion-mensual?block=equipo',
  { label: 'Dashboard', to: '/dashboard' },
  new URLSearchParams(),
)

function TeamPaymentCard({ row }: { row: TeamPayRow }) {
  const navigate = useNavigate()
  const status = teamPayStatusBadge(row.status)
  return (
    <Card interactive onClick={() => navigate(row.ctaHref)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Avatar>
                <AvatarFallback>{initials(row.personName)}</AvatarFallback>
              </Avatar>
              <span className="type-section fg-default">{row.personName}</span>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            {row.blocker ? <span className="type-caption fg-warning">{row.blocker}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="type-mono-2 tabular-nums fg-default">Monto: {formatCurrency(row.amount)}</span>
        </div>
        <FloatingCardCta href={row.ctaHref}>Ver pago</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

export function TeamPaymentsOperationsCard({ payments }: { payments: TeamPayments }) {
  return (
    <section aria-label="Pagos al equipo" className="group/pagos flex flex-col">
      <SectionHeader
        title="Pagos al equipo"
        actions={
          <span className="[@media(hover:hover)]:opacity-0 motion-standard group-hover/pagos:opacity-100 focus-within:opacity-100">
            <DashboardCta href={TEAM_PAYMENTS_CTA_HREF}>
              <span className="sm:hidden">Ver pagos</span>
              <span className="hidden sm:block">Ver pagos al equipo</span>
            </DashboardCta>
          </span>
        }
      />
      <div className="flex flex-col gap-4 md:gap-6 px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10">
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <MetricTile label="Total a pagar" value={formatCompactCurrency(payments.totalToPay)} />
            <MetricTile label="Pagado" value={formatCompactCurrency(payments.paid)} />
            <MetricTile label="Pendiente" value={formatCompactCurrency(payments.pending)} />
            <MetricTile
              label="Bloqueado"
              value={String(payments.blocked)}
              tone={payments.blocked > 0 ? 'fg-danger' : 'fg-default'}
            />
            <MetricTile
              label="Datos bancarios faltantes"
              value={String(payments.missingBank)}
              tone={payments.missingBank > 0 ? 'fg-warning' : 'fg-default'}
            />
          </CardContent>
        </Card>
        {payments.rows.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {payments.rows.map((row) => (
              <TeamPaymentCard key={row.payoutId} row={row} />
            ))}
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">No hay pagos al equipo para este mes.</p>
        )}
      </div>
    </section>
  )
}
