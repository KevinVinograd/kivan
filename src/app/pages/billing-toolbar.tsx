import type { Table } from '@tanstack/react-table'

import { cn } from '@/app/lib/utils'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  buttonVariants,
} from '@/app/components/components'
import { formatMonthYear } from './cobranza-format'
import { type CobranzaPeriod } from './cobranza-periods'
import { FiltersPopover } from './cobranza-filters'
import { BILLING_FILTER_FIELDS } from './billing-format'
import type { Receivable } from './cobros-mock-data'
import { Toolbar } from '@/app/components/patterns'

/** Period selector (full Select) for the header controls slot and — in the detail
 *  view, where the PageHeader is dissolved and inert — the navigator section header. The prev/next
 *  stepper chevrons were removed; the dropdown drives all period changes. Full Select
 *  on every viewport (no below-desktop icon collapse). */
export function BillingPeriodControls({
  selectedPeriod,
  periods,
  onSelectPeriod,
}: {
  selectedPeriod: CobranzaPeriod
  /** Derived per render, never a module constant — see `lib/periods.ts`. */
  periods: CobranzaPeriod[]
  onSelectPeriod: (period: CobranzaPeriod) => void
}) {
  return (
    <Select value={selectedPeriod} onValueChange={(value) => onSelectPeriod(value as CobranzaPeriod)}>
      <SelectTrigger aria-label="Seleccionar período">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {periods.map((period) => (
          <SelectItem key={period} value={period}>
            {formatMonthYear(period)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// Column-visibility menu, mirroring the Cobros/Pagos toolbars. Repeated locally
// per the design-system 1:1 no-shared-composition policy.
function BillingColumnsMenu({ table }: { table: Table<Receivable> }) {
  const columns = table.getAllColumns().filter((column) => column.getCanHide())
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: 'outlined', color: 'primary' }), 'h-10 gap-2 px-3')}
      >
        <AFFORDANCE.columns className="size-4" aria-hidden />
        Ver columnas
      </DropdownMenuTrigger>
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
            {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Facturación table toolbar: search + facturación/monotributo/moneda filters + columns
 *  menu. */
export function BillingToolbar({ table }: { table: Table<Receivable> }) {
  const globalFilter = (table.getState().globalFilter as string | undefined) ?? ''
  return (
    <Toolbar
      search={{
        value: globalFilter,
        onChange: (value) => table.setGlobalFilter(value),
        placeholder: 'Buscar facturación',
        label: 'Buscar facturación',
      }}
      filters={<FiltersPopover table={table} fields={BILLING_FILTER_FIELDS} />}
      trailing={<BillingColumnsMenu table={table} />}
    />
  )
}
