import { cn } from '@/app/lib/utils'
import { TabsList, TabsTrigger } from '@/app/components/components'
import { useIsMobile } from '@/app/lib/use-is-mobile'
import { KpiTabCard, kpiTabFg } from './kpi-tab-card'
import { MobileKpiStrip, type PinnedKpiItem } from './mobile-kpi-strip'
import type { CloseSummaryKpi, CloseSummaryKpiId } from './admin-dashboard-types'

function CloseKpiCard({
  kpi,
  selected,
  compact,
}: {
  kpi: CloseSummaryKpi
  selected: boolean
  compact: boolean
}) {
  const incomplete = kpi.value === null
  return (
    <TabsTrigger value={kpi.id} variant="naked" asChild>
      <KpiTabCard selected={selected} compact={compact} className={cn(compact && 'shrink-0 max-w-40')}>
        <span className={cn('type-caption', kpiTabFg(selected, 'fg-subtle group-hover:fg-default'), compact && 'truncate')}>
          {kpi.label}
        </span>
        <span className={cn('type-headline tabular-nums', kpiTabFg(selected, incomplete ? 'fg-subtle' : 'fg-default'), compact && 'truncate')}>
          {incomplete ? 'No disponible' : kpi.value}
        </span>
        {!compact && (
          <span className={cn('type-caption', kpiTabFg(selected, 'fg-subtle group-hover:fg-default'))}>
            {incomplete ? 'Faltan datos para calcularlo.' : kpi.supporting}
          </span>
        )}
      </KpiTabCard>
    </TabsTrigger>
  )
}

export function AdminCloseSummary({
  kpis,
  selectedId,
  onSelect,
}: {
  kpis: CloseSummaryKpi[]
  selectedId: CloseSummaryKpiId
  onSelect: (id: CloseSummaryKpiId) => void
}) {
  const compact = useIsMobile()
  const triggers = kpis.map((kpi) => (
    <CloseKpiCard key={kpi.id} kpi={kpi} selected={kpi.id === selectedId} compact={compact} />
  ))
  if (!compact) {
    return (
      <TabsList variant="naked" className="grid grid-cols-2 gap-4 px-4 md:px-6 lg:px-8 desktop:px-10 xl:grid-cols-4">
        {triggers}
      </TabsList>
    )
  }
  const items: PinnedKpiItem[] = kpis.map((kpi) => ({
    id: kpi.id,
    label: kpi.label,
    value: kpi.value ?? 'No disponible',
    valueToneClass: kpi.value === null ? 'fg-subtle' : 'fg-default',
  }))
  return (
    <MobileKpiStrip
      triggers={triggers}
      items={items}
      selectedId={selectedId}
      onSelect={(id) => onSelect(id as CloseSummaryKpiId)}
      label="Resumen del cierre (fijado)"
    />
  )
}
