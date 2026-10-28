import { cn } from '@/app/lib/utils'
import { TabsList, TabsTrigger } from '@/app/components/components'
import { useIsMobile } from '@/app/lib/use-is-mobile'
import { KpiTabCard, kpiTabFg } from './kpi-tab-card'
import { MobileKpiStrip, type PinnedKpiItem } from './mobile-kpi-strip'
import type { KpiTone } from './cobranza-format'
import { formatCompactCurrency, formatPercent } from './dashboard-format'
import type { HealthKpis } from './dashboard-types'

/** The five health-summary KPIs, each owning a section of the dashboard below. */
export type MetricId = 'risk' | 'income' | 'margin' | 'operation' | 'overload'

type Metric = {
  id: MetricId
  label: string
  /** Formatted figure, or `null` for the "No disponible" incomplete state. */
  value: string | null
  /** Data-derived fact under the figure. Empty when the month has no data behind it. */
  supporting?: string
  tone: KpiTone
}

/**
 * Resting figure tone. Only the attention states (danger / warning) color the
 * number at rest, so a problem is what pops when the owner scans the strip; a
 * healthy or neutral figure stays fg-default (a healthy 0 must not read as loud
 * as an alarming 3). The selected state still overrides with the full-contrast
 * foreground (via `kpiTabFg`).
 */
const RESTING_FIGURE_FG: Record<KpiTone, string> = {
  default: 'fg-default',
  success: 'fg-default',
  danger: 'fg-danger',
  warning: 'fg-warning',
}

function buildMetrics(kpis: HealthKpis): Metric[] {
  return [
    {
      id: 'risk',
      label: 'Clientes en riesgo',
      value: String(kpis.clientsAtRisk),
      supporting: `${kpis.clientsInAttention} en atención`,
      tone: kpis.clientsAtRisk > 0 ? 'danger' : 'success',
    },
    {
      id: 'income',
      label: 'Ingresos registrados',
      value: kpis.ingresosRegistrados != null ? formatCompactCurrency(kpis.ingresosRegistrados) : null,
      supporting:
        kpis.paidClients != null && kpis.totalClients != null
          ? `${kpis.paidClients} de ${kpis.totalClients} clientes pagaron`
          : '',
      tone: 'default',
    },
    {
      id: 'margin',
      label: 'Margen estimado',
      value: kpis.marginPercent != null ? formatPercent(kpis.marginPercent) : null,
      supporting:
        kpis.estimatedProfit != null
          ? `${formatCompactCurrency(kpis.estimatedProfit)} de resultado proyectado`
          : '',
      tone: kpis.marginPercent != null && kpis.marginPercent < 20 ? 'warning' : 'default',
    },
    {
      id: 'operation',
      label: 'Operación mensual',
      value: formatPercent(kpis.operationCompletion),
      supporting: `${kpis.pendingDataItems} datos pendientes`,
      tone:
        kpis.operationCompletion >= 100 ? 'success' : kpis.operationCompletion < 50 ? 'warning' : 'default',
    },
    {
      id: 'overload',
      label: 'Equipo con sobrecarga',
      value: String(kpis.overloadedTeam),
      supporting: kpis.teamMissingHours != null ? `${kpis.teamMissingHours} sin horas cargadas` : '',
      tone: kpis.overloadedTeam > 0 ? 'warning' : 'success',
    },
  ]
}

/**
 * One KPI tile, rendered as a naked `TabsTrigger` wrapping the shared
 * `KpiTabCard` chrome (lime wash when selected, flat surface + alpha hover
 * otherwise). Radix owns role, roving focus, arrow keys and `aria-selected`;
 * the card is purely visual. Text flips to `fg-high-contrast` when selected
 * (via `kpiTabFg`) and rests on a subtle label / tone-colored figure.
 *
 * `compact` (mobile, pinned strip) drops the supporting line and sizes the card
 * to ~40% width so 2.5 cards peek in the horizontal-scroll bar — label + figure
 * only.
 */
function DashboardMetricCard({
  metric,
  selected,
  compact,
}: {
  metric: Metric
  selected: boolean
  compact: boolean
}) {
  const incomplete = metric.value === null
  // Rendered only when there is something to say: an absent supporting line must
  // drop the node, not emit an empty span (which would still eat the flex gap).
  const caption = incomplete ? 'Faltan datos para calcularlo.' : metric.supporting
  return (
    <TabsTrigger value={metric.id} variant="naked" asChild>
      <KpiTabCard selected={selected} compact={compact} className={cn(compact && 'shrink-0 max-w-[200px]')}>
        <span className={cn('type-caption', kpiTabFg(selected, 'fg-subtle group-hover:fg-default'), compact && 'truncate')}>
          {metric.label}
        </span>
        <span
          className={cn(
            'type-headline tabular-nums',
            kpiTabFg(selected, incomplete ? 'fg-subtle' : RESTING_FIGURE_FG[metric.tone]),
            compact && 'truncate',
          )}
        >
          {incomplete ? 'No disponible' : metric.value}
        </span>
        {!compact && caption ? (
          <span className={cn('type-caption', kpiTabFg(selected, 'fg-subtle group-hover:fg-default'))}>
            {caption}
          </span>
        ) : null}
      </KpiTabCard>
    </TabsTrigger>
  )
}

/**
 * §1 Owner health summary. The headline KPI strip doubles as the dashboard's
 * filter: it is the naked `TabsList` of a radio card group (one card always
 * active). Selecting a card surfaces the section it owns below; the active card
 * paints the lime wash, and a tone-colored resting figure lets the figure's
 * tendency read at a glance without a CTA. The `Tabs` root (value +
 * onValueChange) lives in the page so the same
 * selection drives the panels.
 */
export function DashboardHealthSummary({
  kpis,
  selectedId,
  onSelect,
}: {
  kpis: HealthKpis
  selectedId: MetricId
  onSelect: (id: MetricId) => void
}) {
  const metrics = buildMetrics(kpis)
  // Mobile: a compact, horizontally-scrollable row (label + figure, ~2.5 cards
  // visible) that pins to the top as a fixed overlay once it scrolls away;
  // desktop keeps the grid.
  const compact = useIsMobile()
  const triggers = metrics.map((metric) => (
    <DashboardMetricCard
      key={metric.id}
      metric={metric}
      selected={metric.id === selectedId}
      compact={compact}
    />
  ))
  if (!compact) {
    return (
      <TabsList variant="naked" className="grid grid-cols-2 gap-4 px-4 md:px-6 lg:px-8 desktop:px-10 md:grid-cols-3 xl:grid-cols-5">
        {triggers}
      </TabsList>
    )
  }
  const items: PinnedKpiItem[] = metrics.map((metric) => ({
    id: metric.id,
    label: metric.label,
    value: metric.value ?? 'No disponible',
    valueToneClass: metric.value === null ? 'fg-subtle' : 'fg-default',
  }))
  return (
    <MobileKpiStrip
      triggers={triggers}
      items={items}
      selectedId={selectedId}
      onSelect={(id) => onSelect(id as MetricId)}
      label="Resumen de salud (fijado)"
    />
  )
}
