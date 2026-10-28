import { AFFORDANCE } from '@/app/lib/icon-registry'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/app/components/components'
import { FilterPopover, Toolbar } from '@/app/components/patterns'
import { ACTIVITY_PRESETS, type ActivityFilters, type EntityOption } from './activity-data'
import { ACTIVITY_TYPES, activityTypeLabel } from './activity-format'
import { FilterCountIndicator } from './filter-count-indicator'

type FilterFieldsProps = {
  filters: ActivityFilters
  onChange: (next: Partial<ActivityFilters>) => void
  entities: { members: EntityOption[]; clients: EntityOption[] }
}

/**
 * The period + action-type + entity filter sections, shared by the desktop Filtros
 * popover and the mobile compact FilterPopover panel. Type and entity options are
 * toggleable outlined buttons whose `selected` state marks the active value (clicking
 * one again clears that axis back to "all"); the period is a scope axis that always
 * carries a value, so its chips select but never clear.
 */
function activityFilterItems({ filters, onChange, entities }: FilterFieldsProps) {
  return (
    <>
      <AccordionItem value="period">
        <AccordionTrigger>Período</AccordionTrigger>
        <AccordionContent>
          <ActivityPresetGroup filters={filters} onChange={onChange} />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="type">
        <AccordionTrigger>Tipo de acción</AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {ACTIVITY_TYPES.map((type) => {
              const selected = filters.type === type
              return (
                <Button
                  key={type}
                  variant="outlined"
                  color="primary"
                  size="dense"
                  selected={selected}
                  onClick={() => onChange({ type: selected ? 'all' : type })}
                >
                  {activityTypeLabel(type)}
                </Button>
              )
            })}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="entity">
        <AccordionTrigger>Entidad</AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-3">
            {entities.clients.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="type-caption fg-subtle">Clientes</span>
                <div className="flex flex-wrap gap-2">
                  {entities.clients.map((entity) => {
                    const selected = filters.entity === entity.id
                    return (
                      <Button
                        key={entity.id}
                        variant="outlined"
                        color="primary"
                        size="dense"
                        selected={selected}
                        onClick={() => onChange({ entity: selected ? 'all' : entity.id })}
                      >
                        {entity.name}
                      </Button>
                    )
                  })}
                </div>
              </div>
            ) : null}
            {entities.members.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="type-caption fg-subtle">Equipo</span>
                <div className="flex flex-wrap gap-2">
                  {entities.members.map((entity) => {
                    const selected = filters.entity === entity.id
                    return (
                      <Button
                        key={entity.id}
                        variant="outlined"
                        color="primary"
                        size="dense"
                        selected={selected}
                        onClick={() => onChange({ entity: selected ? 'all' : entity.id })}
                      >
                        {entity.name}
                      </Button>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </AccordionContent>
      </AccordionItem>
    </>
  )
}

/**
 * Time-period presets as a segmented toggle group (one active at a time). Lives in
 * the "Período" section of the Filtros panel — the toolbar itself stays a single row
 * (search + Filtros), and the active period is echoed on the count line under it.
 */
function ActivityPresetGroup({ filters, onChange }: Omit<FilterFieldsProps, 'entities'>) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Período">
      {ACTIVITY_PRESETS.map((preset) => (
        <Button
          key={preset.value}
          variant="outlined"
          size="dense"
          selected={filters.preset === preset.value}
          onClick={() => onChange({ preset: preset.value })}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  )
}

/**
 * Sections that start expanded. "Período" always does — it is a scope axis that
 * always carries a value, so opening the panel must show which window is applied.
 * Type and entity expand only when they already carry one, so the applied filter
 * shows on open.
 */
function activeSections(filters: ActivityFilters) {
  return [
    'period',
    filters.type !== 'all' ? 'type' : null,
    filters.entity !== 'all' ? 'entity' : null,
  ].filter((id): id is string => id != null)
}

/**
 * Count of active filter axes shown on the Filtros trigger (action type + entity).
 * The period is deliberately excluded: it is an always-present scope axis, and a
 * count that can never read zero is meaningless.
 */
function activeAxisCount(filters: ActivityFilters) {
  return [filters.type !== 'all', filters.entity !== 'all'].filter(Boolean).length
}

/**
 * Filters popover (period + action type + entity) for the desktop toolbar, mirroring
 * the Clientes/Equipo toolbar: a "Filtros" trigger carrying the active-axis count,
 * opening an accordion of toggleable outlined buttons. The trigger count covers the
 * narrowing axes only — the period never increments it (see activeAxisCount).
 */
function FiltersPopover({ filters, onChange, entities }: FilterFieldsProps) {
  const activeCount = activeAxisCount(filters)
  const active = activeCount > 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outlined" color="primary" selected={active}>
          <AFFORDANCE.filter className="size-4" aria-hidden />
          Filtros
          {active ? <FilterCountIndicator count={activeCount} /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-2">
        <span className="px-2 pt-2 type-body-2 font-semibold fg-subtle">Filtros</span>
        <Accordion type="multiple" defaultValue={activeSections(filters)} className="w-full">
          {activityFilterItems({ filters, onChange, entities })}
        </Accordion>
      </PopoverContent>
    </Popover>
  )
}

export type ActivityToolbarProps = {
  filters: ActivityFilters
  /** Patch the active filter source (the page owns it). */
  onChange: (next: Partial<ActivityFilters>) => void
  /** Distinct entities present in the feed, grouped for the entity filter. */
  entities: { members: EntityOption[]; clients: EntityOption[] }
  /** Reset search + type + entity + preset to their defaults. */
  onClear: () => void
  hasActiveFilters: boolean
  /**
   * Mobile collapses the toolbar into the same single row with an icon-only
   * FilterPopover trigger instead of the labelled desktop one. Both panels hold the
   * same three sections (period, action type, entity). Defaults to the desktop layout.
   */
  isMobile?: boolean
}

/**
 * Activity log toolbar — a single row at every width: free-text search plus one
 * Filtros panel holding all three axes (period, action type, entity). Desktop adds a
 * Limpiar reset when any filter is active; mobile uses the icon-only FilterPopover
 * trigger, which carries its own clear affordance. The trigger's count covers the
 * narrowing axes only, never the always-present period.
 * Controlled: the page owns one filter source, so the controls stay in sync with
 * the timeline.
 */
export function ActivityToolbar({
  filters,
  onChange,
  entities,
  onClear,
  hasActiveFilters,
  isMobile = false,
}: ActivityToolbarProps) {
  return (
    <Toolbar
      search={{
        value: filters.search,
        onChange: (search) => onChange({ search }),
        placeholder: 'Buscar por persona, cliente o detalle',
        label: 'Buscar actividad',
      }}
      // `isMobile` no longer picks a LAYOUT — Toolbar is one row at every width on its
      // own. It only picks the filter CONTROL: the icon-only trigger (which carries its
      // own clear affordance) on a phone, the labelled panel plus a Limpiar reset above.
      // Limpiar rides in the `filters` slot, not `trailing`, so it stays beside the panel
      // it resets instead of being pushed to the far edge.
      filters={
        isMobile ? (
          <FilterPopover count={activeAxisCount(filters)} onClear={onClear} canClear={hasActiveFilters}>
            <Accordion type="multiple" defaultValue={activeSections(filters)} className="w-full">
              {activityFilterItems({ filters, onChange, entities })}
            </Accordion>
          </FilterPopover>
        ) : (
          <>
            <FiltersPopover filters={filters} onChange={onChange} entities={entities} />
            {hasActiveFilters ? (
              <Button variant="transparent" size="dense" onClick={onClear}>
                Limpiar
              </Button>
            ) : null}
          </>
        )
      }
    />
  )
}
