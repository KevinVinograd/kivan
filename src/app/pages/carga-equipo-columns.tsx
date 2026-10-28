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
  Progress,
  buttonVariants,
} from '@/app/components/components'
import { capacityStatusBadge, formatHours, formatPercent, utilizationTone } from './reports-format'
import type { FilterField } from './cobranza-format'
import type { TeamCapacityReportItem } from './reports-types'

export type CapacityRowActions = {
  onView: (item: TeamCapacityReportItem) => void
  onGoToProfile: (item: TeamCapacityReportItem) => void
  onGoToMonthly: (item: TeamCapacityReportItem) => void
}

const equalsFilter: FilterFn<TeamCapacityReportItem> = (row, columnId, value) =>
  !value || row.getValue(columnId) === value

const clientFilter: FilterFn<TeamCapacityReportItem> = (row, _columnId, value) =>
  !value || row.original.clientNames.includes(String(value))

export function capacitySearchText(item: TeamCapacityReportItem): string {
  return [item.personName, item.role, ...item.clientNames].join(' ').toLowerCase()
}

const uniqueOptions = (values: string[]) =>
  Array.from(new Set(values.filter(Boolean)))
    .sort()
    .map((value) => ({ value, label: value }))

/** Filter axes for the carga toolbar (período is the global header control). */
export function cargaFilterFields(items: TeamCapacityReportItem[]): FilterField[] {
  return [
    { id: 'personName', label: 'Persona', options: uniqueOptions(items.map((i) => i.personName)) },
    { id: 'role', label: 'Rol', options: uniqueOptions(items.map((i) => i.role)) },
    { id: 'clientNames', label: 'Cliente', options: uniqueOptions(items.flatMap((i) => i.clientNames)) },
  ]
}

export function cargaEquipoColumns(actions: CapacityRowActions): ColumnDef<TeamCapacityReportItem>[] {
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
      accessorKey: 'role',
      id: 'role',
      header: 'Rol',
      filterFn: equalsFilter,
      cell: ({ row }) => <span className="type-body-2 fg-default">{row.original.role}</span>,
    },
    {
      accessorKey: 'clientsActive',
      id: 'clientsActive',
      header: 'Clientes activos',
      cell: ({ row }) => <span className="tabular-nums fg-default">{row.original.clientsActive}</span>,
    },
    {
      accessorKey: 'hoursLogged',
      id: 'hoursLogged',
      header: 'Horas cargadas',
      meta: { mobile: 'secondary' },
      cell: ({ row }) => <span className="tabular-nums fg-default">{formatHours(row.original.hoursLogged)}</span>,
    },
    {
      accessorKey: 'capacity',
      id: 'capacity',
      header: 'Capacidad estimada',
      cell: ({ row }) => <span className="tabular-nums fg-default">{formatHours(row.original.capacity)}</span>,
    },
    {
      accessorKey: 'utilization',
      id: 'utilization',
      header: 'Utilización',
      meta: { mobile: 'secondary' },
      cell: ({ row }) => {
        // No configured capacity means no utilization to show. Drop the bar entirely
        // rather than drawing an empty one, which reads as a measured 0%.
        const utilization = row.original.utilization
        if (utilization == null) {
          return <span className="type-caption fg-subtle">{formatPercent(null)}</span>
        }
        return (
          <div className="flex items-center gap-2">
            <Progress
              value={Math.min(100, Math.round(utilization * 100))}
              tone={utilizationTone(utilization)}
              className="h-2 w-20"
            />
            <span className="tabular-nums type-caption fg-subtle">
              {formatPercent(utilization * 100)}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'status',
      id: 'status',
      header: 'Estado',
      meta: { mobile: 'badge' },
      enableSorting: false,
      cell: ({ row }) => {
        const badge = capacityStatusBadge(row.original.status)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    // Filter-only columns (hidden) for the Cliente / Servicio axes.
    {
      id: 'clientNames',
      accessorFn: (row) => row.clientNames.join(', '),
      filterFn: clientFilter,
      enableHiding: true,
      header: () => null,
      cell: () => null,
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
                aria-label="Acciones de la persona"
                className={cn(buttonVariants({ variant: 'transparent', color: 'primary' }), 'size-8 shrink-0')}
              >
                <AFFORDANCE.overflow className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => actions.onView(item)}>
                  <ICON.view aria-hidden />
                  Ver detalle
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => actions.onGoToProfile(item)}>
                  <ICON.team aria-hidden />
                  Ver perfil en Equipo
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onGoToMonthly(item)}>
                  <ICON.monthlyOperation aria-hidden />
                  Ver horas en operación mensual
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}
