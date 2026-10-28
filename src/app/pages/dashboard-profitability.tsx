import { buildTrailHref } from '@/app/lib/nav-trail'
import { SectionHeader } from '@/app/components/templates'
import { Card, CardContent } from '@/app/components/components'
import { KpiSummaryCard, type Kpi } from '@/app/components/patterns'
import { DashboardCta } from './dashboard-cta'
import { MarginBarChart } from './dashboard-margin-chart'
import { formatCompactCurrency, formatPercent } from './dashboard-format'
import type { MarginClient, ProfitabilitySnapshot } from './dashboard-types'

// The dashboard is the trail root, so this section CTA carries a back-trail crumb
// to the dashboard (no inbound trail to forward — `new URLSearchParams()`).
const PROFITABILITY_CTA_HREF = buildTrailHref(
  '/reports?tab=rentabilidad',
  { label: 'Dashboard', to: '/dashboard' },
  new URLSearchParams(),
)

/**
 * One margin ranking (best or lowest), drawn against a zero baseline.
 *
 * The per-row band `Badge` is gone with the list it sat in, and deliberately not
 * reproduced beside the bars: the bar already carries the band (it is what picks its
 * data-state fill) and the printed value already carries the figure. Re-adding a badge
 * would say the same thing a third time — the double-encoding the convention
 * forbids.
 */
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

/**
 * §6 focal → Resultado estimado (the bottom line: is the studio making or losing money
 * this month), toned because the SIGN of that number IS the status. The inputs behind it
 * follow as the supporting tier; only `Margen estimado` carries status, and only when
 * margin health drops under 20%.
 *
 * ...but the sign only carries status when there is a cost side to subtract.
 * `estimatedResult` is `ingresos - egresos`, so a period with no pago loaded resolves to
 * the REVENUE, and the hero then presents the month's billing as profit, in success green,
 * on the first screen of the product. Say the absence instead: `KpiSummaryCard` renders a
 * digit-free value as a quiet `type-section` label rather than a 52px figure, and dropping
 * the tone keeps `figure-color-restraint` honest: there is no status to report.
 */
export function profitabilityKpis(snapshot: ProfitabilitySnapshot): Kpi[] {
  const hasCostBasis = snapshot.egresos > 0
  // `egresos` is the peso lane, so a month whose only outflow is a dollar-paid
  // colaboradora scores zero here. "Sin pagos cargados" would then be a false statement
  // about loaded data rather than a report of its absence — the two cases need different
  // sentences, and neither may be a number.
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
  // A FIGURE, not a hint on one. `KpiSummaryCard`'s density toggle drops hint sub-lines
  // and persists that choice, so a card left collapsed would omit money silently — the
  // one thing this note exists to prevent. `tertiary` keeps it reading as a note rather
  // than a sixth KPI.
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

/**
 * §5 Rentabilidad estimada. The financial snapshot (ingresos, costos, gastos fijos,
 * resultado, margen) over the healthiest and lowest-margin clients.
 *
 * The KPI card spans the section and the two rankings sit BELOW it, rather than the three
 * sharing one row. That is load-bearing, not taste: `KpiSummaryCard` sizes its supporting
 * grid from the figure COUNT using VIEWPORT breakpoints (5 figures → 4 supporting →
 * `grid-cols-2 sm:grid-cols-4`), and `sm:` is always on at desktop. In a third-of-the-row
 * card that bought four columns of ~75px at `lg`, so a 32px "$11,2 M" overflowed its cell
 * and collided with its neighbour. Given the card the full width, the same four columns
 * are ~180px and the figures fit. Do not put this card back into a narrow column.
 */
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
        {/* Two columns from `lg`, not `md`. At `md` the rail is already taking its width, so
            splitting the section in two leaves each chart ~114px of plot and the value labels
            collide with the client names — measured. Below `lg` the cards stack and each one
            gets the full section instead. */}
        <div className="grid gap-4 lg:grid-cols-2">
          <MarginRankingCard title="Mejor margen" clients={snapshot.bestMargin} />
          <MarginRankingCard title="Margen bajo" clients={snapshot.lowMargin} />
        </div>
      </div>
    </section>
  )
}
