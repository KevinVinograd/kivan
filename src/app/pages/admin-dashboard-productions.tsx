import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Badge, Card, CardContent } from '@/app/components/components'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { DashboardCta, FloatingCardCta } from './dashboard-cta'
import { formatCompactCurrency, formatCurrency, formatShortDate, viaticoStatusBadge } from './admin-dashboard-format'
import { MetricTile } from './admin-dashboard-ui'
import type { ProductionRow, ProductionsAndExpenses } from './admin-dashboard-types'

// The dashboard is the trail root, so this section CTA carries a back-trail crumb
// to the dashboard (no inbound trail to forward — `new URLSearchParams()`).
const PRODUCTIONS_CTA_HREF = buildTrailHref(
  '/operacion-mensual?block=equipo',
  { label: 'Dashboard', to: '/dashboard' },
  new URLSearchParams(),
)

function ProductionCard({ row }: { row: ProductionRow }) {
  const navigate = useNavigate()
  const status = viaticoStatusBadge(row.viaticoStatus)
  return (
    <Card interactive onClick={() => navigate(row.ctaHref)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-section fg-default">{row.title}</span>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <span className="type-caption fg-subtle">
              {row.clientName} · {formatShortDate(row.dateIso)}
              {row.people.length > 0 ? ` · ${row.people.join(', ')}` : ''}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="type-mono-2 tabular-nums fg-default">
            {row.amount != null ? `Viáticos: ${formatCurrency(row.amount)}` : 'Sin viáticos'}
          </span>
        </div>
        <FloatingCardCta href={row.ctaHref}>Ver producción</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

/**
 * §4 Producciones y viáticos. Tracks the production work that feeds payments and
 * the monthly close: the month's production + viáticos totals, plus a list of
 * productions still needing attention (one card each, mirroring Clientes en
 * riesgo: viáticos to validate, no client, or billable not defined). Includes the
 * count of viáticos still to validate (the §1 metric folded into this section).
 */
export function ProductionsAndExpensesCard({ productions }: { productions: ProductionsAndExpenses }) {
  return (
    <section aria-label="Producciones y viáticos" className="group/producciones flex flex-col">
      <SectionHeader
        title="Producciones y viáticos"
        description={
          productions.viaticsUnvalidatedCount === 1
            ? '1 producción con viáticos sin pagar.'
            : `${productions.viaticsUnvalidatedCount} producciones con viáticos sin pagar.`
        }
        actions={
          <span className="[@media(hover:hover)]:opacity-0 motion-standard group-hover/producciones:opacity-100 focus-within:opacity-100">
            <DashboardCta href={PRODUCTIONS_CTA_HREF}>Ver producciones</DashboardCta>
          </span>
        }
      />
      <div className="flex flex-col gap-4 md:gap-6 px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10">
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <MetricTile label="Producciones del mes" value={String(productions.total)} />
            <MetricTile label="Cerradas" value={String(productions.closed)} />
            <MetricTile
              label="Con viáticos sin pagar"
              value={String(productions.withPendingViatics)}
              tone={productions.withPendingViatics > 0 ? 'fg-warning' : 'fg-default'}
            />
            <MetricTile label="Viáticos cargados" value={formatCompactCurrency(productions.viaticsLoaded)} />
            <MetricTile label="Viáticos sin pagar" value={formatCompactCurrency(productions.viaticsUnvalidated)} />
          </CardContent>
        </Card>
        {productions.rows.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {productions.rows.map((row) => (
              <ProductionCard key={row.id} row={row} />
            ))}
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">
            {productions.total > 0
              ? 'Todas las producciones del mes están cerradas.'
              : 'No hay producciones cargadas para este mes.'}
          </p>
        )}
      </div>
    </section>
  )
}
