import { useEffect, useMemo, useState } from 'react'

import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/app/components/components'
import { cn } from '@/app/lib/utils'
import { useIsMobile } from '@/app/lib/use-is-mobile'
import { useRole } from '@/app/lib/use-role'
import {
  entityOptions,
  filterActivity,
  getActivityFeed,
  presetScopeLabel,
  type ActivityFilters,
} from './activity-data'
import { ActivityToolbar } from './activity-toolbar'
import { ActivityTimeline } from './activity-timeline'

const DEFAULT_FILTERS: ActivityFilters = { search: '', type: 'all', entity: 'all', preset: 'last-month' }

export function ActivityDrawer() {
  const { role } = useRole()
  const isMobile = useIsMobile()
  const gutter = isMobile ? 'px-4' : 'px-8'
  const feed = useMemo(() => getActivityFeed(role), [role])
  const entities = useMemo(() => entityOptions(feed), [feed])

  const [filters, setFilters] = useState<ActivityFilters>(DEFAULT_FILTERS)
  useEffect(() => setFilters(DEFAULT_FILTERS), [role])
  const items = useMemo(() => filterActivity(feed, filters), [feed, filters])

  const hasActiveFilters =
    filters.search !== '' ||
    filters.type !== 'all' ||
    filters.entity !== 'all' ||
    filters.preset !== DEFAULT_FILTERS.preset

  const update = (next: Partial<ActivityFilters>) => setFilters((prev) => ({ ...prev, ...next }))
  const clear = () => setFilters(DEFAULT_FILTERS)

  const countLabel = `${items.length} ${items.length === 1 ? 'movimiento' : 'movimientos'} · ${presetScopeLabel(filters.preset)}`
  const description =
    role === 'employee' ? 'Tu actividad por período.' : 'Actividad del workspace por período.'

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outlined" size="dense">
          Ver actividad
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader className={cn(gutter, 'pb-0')}>
          <SheetTitle>Actividad</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className={cn('flex flex-col gap-3', gutter)}>
          <ActivityToolbar
            filters={filters}
            onChange={update}
            entities={entities}
            onClear={clear}
            hasActiveFilters={hasActiveFilters}
            isMobile={isMobile}
          />
          <p className="type-caption fg-subtle">{countLabel}</p>
        </div>
        <div className={cn('mt-2 min-h-0 flex-1 overflow-y-auto pb-6', gutter)}>
          {items.length > 0 ? (
            <ActivityTimeline items={items} />
          ) : (
            <p className="type-body-2 fg-subtle">No hay actividad para los filtros seleccionados.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
