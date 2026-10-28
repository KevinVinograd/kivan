import { cn } from '@/app/lib/utils'
import { TabsList, TabsTrigger } from '@/app/components/components'
import { KpiTabCard, kpiTabFg } from './kpi-tab-card'
import { useIsMobile } from '@/app/lib/use-is-mobile'
import { MobileKpiStrip, type PinnedKpiItem } from './mobile-kpi-strip'
import type { KpiTone } from './cobranza-format'
import { formatHours, formatPercent } from './employee-dashboard-format'
import type { EmployeeDashboardData } from './employee-dashboard-types'

/** The four summary KPIs, each owning a filtered section of the dashboard below. */
export type EmployeeMetricId = 'pending' | 'clients' | 'objectives' | 'hours'

type Metric = {
  id: EmployeeMetricId
  label: string
  value: string
  supporting: string
  tone: KpiTone
}

function buildMetrics(data: EmployeeDashboardData): Metric[] {
  const { summary, objectives, pending } = data
  const completion =
    summary.objectivesTotal > 0
      ? Math.round((summary.objectivesCompleted / summary.objectivesTotal) * 100)
      : 0
  const objectivesAtRisk = objectives.some(
    (objective) => objective.status === 'en_riesgo' || objective.status === 'vencido',
  )
  const pendingOverdue = pending.some((item) => item.status === 'vencido')

  return [
    {
      id: 'pending',
      label: 'Pendientes',
      value: String(summary.pendingCount),
      supporting: 'Tareas, producciones o extras por resolver',
      tone: pendingOverdue ? 'danger' : summary.pendingCount > 0 ? 'warning' : 'success',
    },
    {
      id: 'clients',
      label: 'Clientes asignados',
      value: String(summary.assignedClients),
      supporting: `${summary.activeClients} activos este mes`,
      tone: 'default',
    },
    {
      id: 'objectives',
      label: 'Objetivos del mes',
      value: formatPercent(completion),
      supporting: `${summary.objectivesCompleted} de ${summary.objectivesTotal} cumplidos`,
      tone: completion >= 100 ? 'success' : objectivesAtRisk ? 'warning' : 'default',
    },
    {
      id: 'hours',
      label: 'Horas cargadas',
      value: formatHours(summary.hoursLoaded),
      supporting: `${summary.missingHours} h pendientes de cargar`,
      tone: summary.missingHours > 0 ? 'warning' : 'success',
    },
  ]
}

/**
 * One KPI tile, rendered as a naked `TabsTrigger` paired with a `KpiTabCard`.
 * The active card carries the lime treatment and flips its text to the
 * full-contrast `fg-high-contrast`. Radix owns role, roving focus, arrow keys
 * and `aria-selected`; the card is purely visual (no CTA — the card IS the
 * control).
 *
 * `compact` (mobile, pinned strip) drops the supporting line and sizes the card
 * to ~40% width so 2.5 cards peek in the horizontal-scroll bar — label + figure
 * only.
 */
function EmployeeSummaryCard({
  metric,
  selected,
  compact,
}: {
  metric: Metric
  selected: boolean
  compact: boolean
}) {
  return (
    <TabsTrigger value={metric.id} variant="naked" asChild>
      <KpiTabCard selected={selected} compact={compact} className={cn(compact && 'shrink-0 max-w-[200px]')}>
        <span className={cn('type-caption', kpiTabFg(selected, 'fg-subtle group-hover:fg-default'), compact && 'truncate')}>
          {metric.label}
        </span>
        <span
          className={cn('type-headline tabular-nums', kpiTabFg(selected, 'fg-default'), compact && 'truncate')}
        >
          {metric.value}
        </span>
        {!compact && (
          <span className={cn('type-caption', kpiTabFg(selected, 'fg-subtle group-hover:fg-default'))}>
            {metric.supporting}
          </span>
        )}
      </KpiTabCard>
    </TabsTrigger>
  )
}

/**
 * §1 Mi resumen. The four headline KPIs double as the dashboard's filter: the
 * naked `TabsList` of a radio card group (one card always active, defaulting to
 * pending). Selecting a card surfaces the section it owns below; the active card
 * paints the lime treatment so the selection reads at a glance. The `Tabs` root
 * (value + onValueChange) lives in the page so the same selection drives the
 * panels.
 */
export function EmployeeSummary({
  data,
  selectedId,
  onSelect,
}: {
  data: EmployeeDashboardData
  selectedId: EmployeeMetricId
  onSelect: (id: EmployeeMetricId) => void
}) {
  const metrics = buildMetrics(data)
  // Mobile: a compact, horizontally-scrollable row (label + figure, ~2.5 cards
  // visible) that pins to the top as a fixed overlay once it scrolls away;
  // desktop keeps the grid.
  const compact = useIsMobile()
  const triggers = metrics.map((metric) => (
    <EmployeeSummaryCard
      key={metric.id}
      metric={metric}
      selected={metric.id === selectedId}
      compact={compact}
    />
  ))
  if (!compact) {
    return (
      <TabsList variant="naked" className="grid grid-cols-2 gap-4 px-4 md:px-6 lg:px-8 desktop:px-10 xl:grid-cols-4">
        {triggers}
      </TabsList>
    )
  }
  const items: PinnedKpiItem[] = metrics.map((metric) => ({
    id: metric.id,
    label: metric.label,
    value: metric.value,
    valueToneClass: 'fg-default',
  }))
  return (
    <MobileKpiStrip
      triggers={triggers}
      items={items}
      selectedId={selectedId}
      onSelect={(id) => onSelect(id as EmployeeMetricId)}
      label="Mi resumen (fijado)"
    />
  )
}
