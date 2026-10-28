import type { ColumnDef, FilterFn } from '@tanstack/react-table'

import { cn } from '@/app/lib/utils'
import { AFFORDANCE, ICON } from '@/app/lib/icon-registry'
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  buttonVariants,
} from '@/app/components/components'
import { formatHours, formatShortDate } from './reports-format'
import type { FilterField } from './cobranza-format'
import type { ProductivityReportItem } from './reports-types'

/** Client lifecycle label for the Estado column + its filter. */
export const CLIENT_STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  onboarding: 'Onboarding',
  paused: 'Pausado',
  churned: 'Baja',
}

export type ProductivityRowActions = {
  onView: (item: ProductivityReportItem) => void
  onGoToClient: (item: ProductivityReportItem) => void
  onGoToPerson: (item: ProductivityReportItem) => void
}

const equalsFilter: FilterFn<ProductivityReportItem> = (row, columnId, value) =>
  !value || row.getValue(columnId) === value

/** Searchable text for the productivity table (person, client, task, service). */
export function productivitySearchText(item: ProductivityReportItem): string {
  return [item.personName, item.clientName, item.taskType, item.service].join(' ').toLowerCase()
}

const uniqueOptions = (values: string[], labelOf: (value: string) => string) =>
  Array.from(new Set(values))
    .sort()
    .map((value) => ({ value, label: labelOf(value) }))

/** Filter axes for the productivity toolbar (período is the global header control). */
export function productividadFilterFields(items: ProductivityReportItem[]): FilterField[] {
  return [
    { id: 'personName', label: 'Persona', options: uniqueOptions(items.map((i) => i.personName), (v) => v) },
    { id: 'clientName', label: 'Cliente', options: uniqueOptions(items.map((i) => i.clientName), (v) => v) },
    { id: 'taskType', label: 'Tipo de tarea', options: uniqueOptions(items.map((i) => i.taskType), (v) => v) },
    { id: 'service', label: 'Servicio', options: uniqueOptions(items.map((i) => i.service), (v) => v) },
    {
      id: 'clientStatus',
      label: 'Estado del cliente',
      options: uniqueOptions(items.map((i) => i.clientStatus), (v) => CLIENT_STATUS_LABEL[v] ?? v),
    },
  ]
}

export function productividadColumns(
  actions: ProductivityRowActions,
): ColumnDef<ProductivityReportItem>[] {
  return [
    {
      accessorKey: 'personName',
      id: 'personName',
      header: 'Persona',
      meta: { mobile: 'title' },
      filterFn: equalsFilter,
      cell: ({ row }) => <span className="type-button fg-default">{row.original.personName}</span>,
    },
    {
      accessorKey: 'clientName',
      id: 'clientName',
      header: 'Cliente',
      filterFn: equalsFilter,
      cell: ({ row }) => <span className="type-body-2 fg-default">{row.original.clientName}</span>,
    },
    {
      accessorKey: 'taskType',
      id: 'taskType',
      header: 'Tarea',
      filterFn: equalsFilter,
      cell: ({ row }) => <span className="type-body-2 fg-default">{row.original.taskType}</span>,
    },
    {
      accessorKey: 'service',
      id: 'service',
      header: 'Servicio',
      filterFn: equalsFilter,
      enableSorting: false,
      cell: ({ row }) => <span className="type-body-2 fg-default">{row.original.service}</span>,
    },
    {
      accessorKey: 'hours',
      id: 'hours',
      header: 'Horas',
      meta: { mobile: 'secondary' },
      cell: ({ row }) => <span className="tabular-nums fg-default">{formatHours(row.original.hours)}</span>,
    },
    {
      accessorKey: 'date',
      id: 'date',
      header: 'Fecha',
      cell: ({ row }) => <span className="type-body-2 tabular-nums fg-default">{formatShortDate(row.original.date)}</span>,
    },
    {
      accessorKey: 'isExtra',
      id: 'isExtra',
      header: 'Es extra',
      meta: { mobile: 'badge' },
      enableSorting: false,
      cell: ({ row }) =>
        row.original.isExtra ? (
          <Badge variant="warning">Extra</Badge>
        ) : (
          <span className="type-body-2 fg-subtle">No</span>
        ),
    },
    {
      accessorKey: 'clientStatus',
      id: 'clientStatus',
      header: 'Estado',
      filterFn: equalsFilter,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="type-body-2 fg-subtle">
          {CLIENT_STATUS_LABEL[row.original.clientStatus] ?? row.original.clientStatus}
        </span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Acciones de la carga"
                className={cn(buttonVariants({ variant: 'transparent', color: 'primary' }), 'size-8 shrink-0')}
              >
                <AFFORDANCE.overflow className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => actions.onView(item)}>
                  <ICON.view aria-hidden />
                  Ver persona
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => actions.onGoToClient(item)}>
                  <ICON.clients aria-hidden />
                  Ir a cliente
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onGoToPerson(item)}>
                  <ICON.team aria-hidden />
                  Ir a persona
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}
