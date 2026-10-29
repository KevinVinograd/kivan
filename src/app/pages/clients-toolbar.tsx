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
import type { Client } from './clients-mock-data'
import { FilterCountIndicator } from './filter-count-indicator'
import { FilterFieldsAccordion } from './clients-filters'
import { COLUMN_LABELS } from './clients-columns'
import { ClientsBulkActions } from './clients-bulk-actions'

function ColumnsMenu({ table }: { table: Table<Client> }) {
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
          className={cn(
            buttonVariants({ variant: 'outlined', color: 'primary' }),
            'h-10 gap-2 px-3',
          )}
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

function FiltersPopover({ table }: { table: Table<Client> }) {
  const isBelowDesktop = useIsBelowDesktop()
  const activeCount = table.getState().columnFilters.length
  const active = activeCount > 0
  const fields = (
    <FilterFieldsAccordion
      valueFor={(id) => table.getColumn(id)?.getFilterValue() as string | undefined}
      onToggle={(id, value) => table.getColumn(id)?.setFilterValue(value)}
    />
  )

  if (isBelowDesktop) {
    return (
      <FilterPopover count={activeCount} onClear={() => table.resetColumnFilters()}>
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
        {fields}
      </PopoverContent>
    </Popover>
  )
}

export type ClientsToolbarProps = {
  table: Table<Client>
  onBulkInvoice: (clients: Client[]) => void
  onBulkChangeStatus: (clients: Client[]) => void
  onBulkExport: (clients: Client[]) => void
}

export function ClientsToolbar({
  table,
  onBulkInvoice,
  onBulkChangeStatus,
  onBulkExport,
}: ClientsToolbarProps) {
  const globalFilter = (table.getState().globalFilter as string | undefined) ?? ''
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedClients = selectedRows.map((row) => row.original)

  return (
    <Toolbar
      search={{
        value: globalFilter,
        onChange: (value) => table.setGlobalFilter(value),
        placeholder: 'Buscar por nombre, CUIT o email',
        label: 'Buscar clientes',
      }}
      filters={<FiltersPopover table={table} />}
      trailing={<ColumnsMenu table={table} />}
      bulk={
        <ClientsBulkActions
          clients={selectedClients}
          onInvoice={onBulkInvoice}
          onChangeStatus={onBulkChangeStatus}
          onExport={onBulkExport}
          onClear={() => table.resetRowSelection()}
        />
      }
    />
  )
}
