import { cn } from '@/app/lib/utils'
import { TabsList, TabsTrigger } from '@/app/components/components'
import { useIsMobile } from '@/app/lib/use-is-mobile'
import { KpiTabCard, kpiTabFg } from './kpi-tab-card'
import { MobileKpiStrip, type PinnedKpiItem } from './mobile-kpi-strip'
import type { KpiTone } from './cobranza-format'
import { formatCompactCurrency, formatPercent } from './dashboard-format'
import type { HealthKpis } from './dashboard-types'

export type MetricId = 'risk' | 'income' | 'margin' | 'operation' | 'overload'

type Metric = {
  id: MetricId
  label: string
  value: string | null
  supporting?: string
  tone: KpiTone
}

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
