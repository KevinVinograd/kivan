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

/** Open on the last month so the timeline reads rich, then narrow with the presets. */
const DEFAULT_FILTERS: ActivityFilters = { search: '', type: 'all', entity: 'all', preset: 'last-month' }

/**
 * Actividad por período — a review drawer opened from each dashboard's "Ver
 * actividad" button (all roles). It is a quick "review what was done, then close"
 * surface rather than a full page: a prominent timeline of every workspace event
 * (owner/admin) or the person's own events (employee). A single filter source drives
 * the timeline, and every control sits in one row: free-text search plus a Filtros
 * panel holding all three axes (period, action type, entity). The active period is
 * echoed on the count line, so the applied window reads without opening the panel.
 * The header + controls stay pinned while the timeline scrolls.
 * Read-only. From 1024px it slides in from the right as a floating panel: half the
 * viewport on laptop (1024-1439px), a third from 1440px up. On tablet and mobile
 * (≤1023px) it rises as a bottom sheet — matching the entity-detail views — with the
 * 16px page gutter on mobile.
 */
export function ActivityDrawer() {
  const { role } = useRole()
  // The bottom-sheet-below-desktop / right-drawer-above behavior is the Sheet
  // primitive's own now (see SheetContent), so this component no longer branches on it.
  // It still needs the mobile breakpoint for its gutter: 16px (px-4) on the phone
  // bottom sheet, 32px (px-8) on the tablet sheet and the desktop drawer.
  const isMobile = useIsMobile()
  const gutter = isMobile ? 'px-4' : 'px-8'
  const feed = useMemo(() => getActivityFeed(role), [role])
  const entities = useMemo(() => entityOptions(feed), [feed])

  const [filters, setFilters] = useState<ActivityFilters>(DEFAULT_FILTERS)
  // Reset filters when the role (and thus the feed) changes in-place via the dev
  // role pill, so a stale entity id from the previous feed can't blank the entity
  // Select and empty the list.
  useEffect(() => setFilters(DEFAULT_FILTERS), [role])
  const items = useMemo(() => filterActivity(feed, filters), [feed, filters])

  const hasActiveFilters =
    filters.search !== '' ||
    filters.type !== 'all' ||
    filters.entity !== 'all' ||
    filters.preset !== DEFAULT_FILTERS.preset

  const update = (next: Partial<ActivityFilters>) => setFilters((prev) => ({ ...prev, ...next }))
  const clear = () => setFilters(DEFAULT_FILTERS)

  // The period lives inside the Filtros panel now, so the count line carries it —
  // the scope of what the timeline shows stays readable without opening the panel.
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
      {/* No side/width override: `side="right"` IS the responsive record drawer now —
          a bottom sheet below desktop, half the viewport at laptop widths, a third from
          1440px up. That behavior moved into the Sheet primitive (it is how every
          drawer should read, not something specific to Actividad), so this call site
          only states its intent. */}
      <SheetContent side="right">
        {/* L/R gutter across the header, controls and list: 16px (px-4) on the
            mobile bottom sheet, 32px (px-8) on the tablet bottom sheet + desktop drawer.
            The column rides the primitive's own 16px (gap-4) rhythm: dropping the
            header's bottom padding (pb-0) leaves that gap alone between the title block
            and the search row, so the controls read as one unit with the header they
            filter instead of floating 40px below it. */}
        <SheetHeader className={cn(gutter, 'pb-0')}>
          <SheetTitle>Actividad</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {/* Pinned controls — one toolbar row (search + Filtros) and the count line;
            both stay put while the list scrolls. */}
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
        {/* mt-2 tops the column's 16px gap back up to the 24px that separates the
            pinned controls from the scrolling list. It is a margin, not padding, so it
            sits OUTSIDE the scroll box and the list keeps clipping at the same line. */}
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
