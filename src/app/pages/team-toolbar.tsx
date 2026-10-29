import type { Table } from '@tanstack/react-table'
import { cn } from '@/app/lib/utils'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  buttonVariants,
} from '@/app/components/components'
import { FilterPopover, Toolbar } from '@/app/components/patterns'
import { useIsBelowDesktop } from '@/app/lib/use-is-mobile'
import type { TeamMember } from './clients-mock-data'
import { FilterCountIndicator } from './filter-count-indicator'
import { TeamFilterFieldsAccordion } from './team-filters'
import { COLUMN_LABELS } from './team-columns'
import { TeamBulkActions } from './team-bulk-actions'
import type { TeamFilters } from './team-format'

function ColumnsMenu({ table }: { table: Table<TeamMember> }) {
  const isBelowDesktop = useIsBelowDesktop()
  const columns = table.getAllColumns().filter((column) => column.getCanHide())
  return (
    <DropdownMenu>
      {isBelowDesktop ? (
        <DropdownMenuTrigger asChild>
          <IconButton
            variant="outlined"
            color="primary"
            aria-label="Ver columnas"
            title="Ver columnas"
          >
            <AFFORDANCE.columns className="size-5" aria-hidden />
          </IconButton>
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          className={cn(buttonVariants({ variant: 'outlined', color: 'primary' }), 'h-10 gap-2 px-3')}
        >
          <AFFORDANCE.columns className="size-4" aria-hidden />
          Ver columnas
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Columnas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(value) => column.toggleVisibility(!!value)}
            onSelect={(event) => event.preventDefault()}
          >
            {COLUMN_LABELS[column.id] ?? column.id}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FiltersPopover({
  filters,
  onChange,
}: {
  filters: TeamFilters
  onChange: (filters: TeamFilters) => void
}) {
  const isBelowDesktop = useIsBelowDesktop()
  const activeCount = Object.values(filters).filter(Boolean).length
  const active = activeCount > 0
  const set = (id: keyof TeamFilters, value: string | undefined) =>
    onChange({ ...filters, [id]: value })
  const fields = <TeamFilterFieldsAccordion valueFor={(id) => filters[id]} onToggle={set} />

  if (isBelowDesktop) {
    return (
      <FilterPopover count={activeCount} onClear={() => onChange({})}>
        {fields}
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
            <Button variant="transparent" color="primary" size="dense" onClick={() => onChange({})}>
              Limpiar
            </Button>
          ) : null}
        </div>
        {fields}
      </PopoverContent>
    </Popover>
  )
}

export type TeamToolbarProps = {
  table: Table<TeamMember>
  query: string
  onQueryChange: (query: string) => void
  filters: TeamFilters
  onFiltersChange: (filters: TeamFilters) => void
  onBulkGenerateStatements: (members: TeamMember[]) => void
  onBulkChangeStatus: (members: TeamMember[]) => void
  onBulkExport: (members: TeamMember[]) => void
}

export function TeamToolbar({
  table,
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  onBulkGenerateStatements,
  onBulkChangeStatus,
  onBulkExport,
}: TeamToolbarProps) {
  const selectedMembers = table.getFilteredSelectedRowModel().rows.map((row) => row.original)

  return (
    <Toolbar
      search={{
        value: query,
        onChange: onQueryChange,
        placeholder: 'Buscar por nombre, rol, cliente o servicio',
        label: 'Buscar personas',
      }}
      filters={<FiltersPopover filters={filters} onChange={onFiltersChange} />}
      trailing={<ColumnsMenu table={table} />}
      bulk={
        <TeamBulkActions
          members={selectedMembers}
          onGenerateStatements={onBulkGenerateStatements}
          onChangeStatus={onBulkChangeStatus}
          onExport={onBulkExport}
          onClear={() => table.resetRowSelection()}
        />
      }
    />
  )
}
