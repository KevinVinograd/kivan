import { buildTrailHref } from '@/app/lib/nav-trail'
import { SectionHeader } from '@/app/components/templates'
import { Card, CardContent } from '@/app/components/components'
import { KpiSummaryCard, type Kpi } from '@/app/components/patterns'
import { DashboardCta } from './dashboard-cta'
import { MarginBarChart } from './dashboard-margin-chart'
import { formatCompactCurrency, formatPercent } from './dashboard-format'
import type { MarginClient, ProfitabilitySnapshot } from './dashboard-types'

const PROFITABILITY_CTA_HREF = buildTrailHref(
  '/reports?tab=rentabilidad',
  { label: 'Dashboard', to: '/dashboard' },
  new URLSearchParams(),
)

function MarginRankingCard({ title, clients }: { title: string; clients: MarginClient[] }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <span className="type-caption fg-subtle">{title}</span>
        <MarginBarChart clients={clients} ariaLabel={title} />
      </CardContent>
    </Card>
  )
}

export function profitabilityKpis(snapshot: ProfitabilitySnapshot): Kpi[] {
  const hasCostBasis = snapshot.egresos > 0
  const absenceLabel =
    snapshot.otherLanePaymentCount > 0 ? 'Sin pagos en pesos' : 'Sin pagos cargados'
  const figures: Kpi[] = [
    {
      id: 'estimated-result',
      label: 'Resultado estimado',
      value: hasCostBasis ? formatCompactCurrency(snapshot.estimatedResult) : absenceLabel,
      ...(hasCostBasis
        ? { tone: snapshot.estimatedResult >= 0 ? ('success' as const) : ('danger' as const) }
        : {}),
    },
    { id: 'recorded-income', label: 'Ingresos registrados', value: formatCompactCurrency(snapshot.ingresos) },
    { id: 'team-cost', label: 'Costos del equipo', value: formatCompactCurrency(snapshot.teamCost) },
    {
      id: 'fixed-expenses',
      label: 'Gastos fijos asignados',
      value: formatCompactCurrency(snapshot.fixedExpenses),
    },
    {
      id: 'estimated-margin',
      label: 'Margen estimado',
      value: formatPercent(snapshot.marginPercent),
      tone: snapshot.marginPercent < 20 ? 'warning' : 'default',
    },
  ]
  if (snapshot.otherLaneCount > 0) {
    figures.push({
      id: 'other-lane',
      label: 'En otra moneda',
      value: String(snapshot.otherLaneCount),
      tertiary: true,
    })
  }
  return figures
}

export function ProfitabilitySnapshotSection({ snapshot }: { snapshot: ProfitabilitySnapshot }) {
  const kpis = profitabilityKpis(snapshot)

  return (
    <section aria-label="Rentabilidad estimada" className="group/rentabilidad flex flex-col">
      <SectionHeader
        title="Rentabilidad estimada"
        actions={
          <span className="[@media(hover:hover)]:opacity-0 motion-standard group-hover/rentabilidad:opacity-100 focus-within:opacity-100">
            <DashboardCta href={PROFITABILITY_CTA_HREF}>
              <span className="sm:hidden">Ver rentabilidad</span>
              <span className="hidden sm:block">Ver rentabilidad por cliente</span>
            </DashboardCta>
          </span>
        }
      />
      <div className="flex flex-col gap-4 px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10">
        <KpiSummaryCard figures={kpis} heroId="estimated-result" />
        <div className="grid gap-4 lg:grid-cols-2">
          <MarginRankingCard title="Mejor margen" clients={snapshot.bestMargin} />
          <MarginRankingCard title="Margen bajo" clients={snapshot.lowMargin} />
        </div>
      </div>
    </section>
  )
}
