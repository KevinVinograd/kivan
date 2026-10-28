import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Badge, Card, CardContent } from '@/app/components/components'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { DashboardCta, FloatingCardCta } from './dashboard-cta'
import { expenseStatusBadge, formatCompactCurrency, formatCurrency, formatSignedPercent } from './admin-dashboard-format'
import { MetricTile } from './admin-dashboard-ui'
import type { FixedExpenseRow, FixedExpensesSummary } from './admin-dashboard-types'

// The dashboard is the trail root, so this section CTA carries a back-trail crumb
// to the dashboard (no inbound trail to forward — `new URLSearchParams()`).
const EXPENSES_CTA_HREF = buildTrailHref(
  '/operacion-mensual?block=equipo',
  { label: 'Dashboard', to: '/dashboard' },
  new URLSearchParams(),
)

function ExpenseCard({ row }: { row: FixedExpenseRow }) {
  const navigate = useNavigate()
  const status = expenseStatusBadge(row.status)
  return (
    <Card interactive onClick={() => navigate(row.ctaHref)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-section fg-default">{row.concept}</span>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <span className="type-caption fg-subtle">{row.category}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="type-mono-2 tabular-nums fg-default">Monto: {formatCurrency(row.amount)}</span>
        </div>
        <FloatingCardCta href={row.ctaHref}>Ver gasto</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

/**
 * §8 Gastos fijos. Tracks the fixed agency expenses that affect profitability and
 * the close: the expected / registered / pending totals (and the month-over-month
 * variation when a prior month exists) plus a list of expenses by status (one
 * card each, mirroring Clientes en riesgo). Secondary to pending data, payments,
 * hours, viáticos and invoicing.
 */
export function FixedExpensesCard({ expenses }: { expenses: FixedExpensesSummary }) {
  return (
    <section aria-label="Gastos fijos" className="group/gastos flex flex-col">
      <SectionHeader
        title="Gastos fijos"
        actions={
          <span className="[@media(hover:hover)]:opacity-0 motion-standard group-hover/gastos:opacity-100 focus-within:opacity-100">
            <DashboardCta href={EXPENSES_CTA_HREF}>Ver gastos</DashboardCta>
          </span>
        }
      />
      <div className="flex flex-col gap-4 md:gap-6 px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10">
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricTile label="Gastos fijos esperados" value={formatCompactCurrency(expenses.expected)} />
            <MetricTile label="Registrados" value={formatCompactCurrency(expenses.registered)} />
            <MetricTile
              label="Pendientes"
              value={formatCompactCurrency(expenses.pending)}
              tone={expenses.pending > 0 ? 'fg-warning' : 'fg-default'}
            />
            <MetricTile
              label="Variación vs mes anterior"
              value={expenses.variationPercent != null ? formatSignedPercent(expenses.variationPercent) : 'No disponible'}
            />
          </CardContent>
        </Card>
        {expenses.rows.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {expenses.rows.map((row) => (
              <ExpenseCard key={row.id} row={row} />
            ))}
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">No hay gastos fijos cargados para este mes.</p>
        )}
      </div>
    </section>
  )
}
