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

function activeSections(filters: ActivityFilters) {
  return [
    'period',
    filters.type !== 'all' ? 'type' : null,
    filters.entity !== 'all' ? 'entity' : null,
  ].filter((id): id is string => id != null)
}

function activeAxisCount(filters: ActivityFilters) {
  return [filters.type !== 'all', filters.entity !== 'all'].filter(Boolean).length
}

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
  onChange: (next: Partial<ActivityFilters>) => void
  entities: { members: EntityOption[]; clients: EntityOption[] }
  onClear: () => void
  hasActiveFilters: boolean
  isMobile?: boolean
}

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
