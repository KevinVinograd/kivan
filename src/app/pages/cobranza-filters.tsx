import type { Table } from '@tanstack/react-table'

import { AFFORDANCE } from '@/app/lib/icon-registry'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/app/components/components'
import { FilterPopover } from '@/app/components/patterns'
import { useIsBelowDesktop } from '@/app/lib/use-is-mobile'
import { FilterCountIndicator } from './filter-count-indicator'
import type { FilterField } from './cobranza-format'

type AccordionProps = {
  fields: FilterField[]
  /** Current active option value for a field, or `undefined` when unset. */
  valueFor: (id: string) => string | undefined
  /** Toggle a field to a value, or clear it (pass `undefined`) when re-selecting. */
  onToggle: (id: string, value: string | undefined) => void
}

/**
 * Shared filter body for the Cobros / Pagos toolbars: one accordion section per
 * `FilterField`, options as toggleable outlined Buttons whose `selected` state is
 * the active value (clicking it again clears the field). Sections that already
 * carry an active filter start expanded. Single-select per axis, mirroring the
 * Clients filter pattern.
 */
function FilterFieldsAccordion({ fields, valueFor, onToggle }: AccordionProps) {
  const defaultValue = fields.filter((field) => valueFor(field.id) != null).map((field) => field.id)
  return (
    <Accordion type="multiple" defaultValue={defaultValue} className="w-full">
      {fields.map((field) => {
        const value = valueFor(field.id)
        return (
          <AccordionItem key={field.id} value={field.id}>
            <AccordionTrigger>{field.label}</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-wrap gap-2">
                {field.options.map((option) => {
                  const selected = value === option.value
                  return (
                    <Button
                      key={option.value}
                      variant="outlined"
                      color="primary"
                      size="dense"
                      selected={selected}
                      onClick={() => onToggle(field.id, selected ? undefined : option.value)}
                    >
                      {option.label}
                    </Button>
                  )
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}

/**
 * Filters popover for a DataTable toolbar — generic over the row type. Reads and
 * writes tanstack column filter values keyed by `FilterField.id` (which must
 * match the table column ids), shows the active-filter count on the trigger, and
 * offers a "Limpiar" reset. Reused by both the Cobros and Pagos toolbars.
 */
export function FiltersPopover<TData>({
  table,
  fields,
}: {
  table: Table<TData>
  fields: FilterField[]
}) {
  // Below desktop (≤1023px: tablet + phone) the labelled "Filtros" button
  // collapses to the canonical icon-only FilterPopover (funnel + active-axis
  // count badge); the panel body is identical at every width.
  const isBelowDesktop = useIsBelowDesktop()
  const activeCount = table.getState().columnFilters.length
  const active = activeCount > 0
  const body = (
    <FilterFieldsAccordion
      fields={fields}
      valueFor={(id) => table.getColumn(id)?.getFilterValue() as string | undefined}
      onToggle={(id, value) => table.getColumn(id)?.setFilterValue(value)}
    />
  )

  if (isBelowDesktop) {
    return (
      <FilterPopover count={activeCount} onClear={() => table.resetColumnFilters()}>
        {body}
      </FilterPopover>
    )
  }

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
        <div className="flex items-center justify-between px-2 pt-2">
          <span className="type-body-2 font-semibold fg-subtle">Filtros</span>
          {active ? (
            <Button
              variant="transparent"
              color="primary"
              size="dense"
              onClick={() => table.resetColumnFilters()}
            >
              Limpiar
            </Button>
          ) : null}
        </div>
        {body}
      </PopoverContent>
    </Popover>
  )
}
