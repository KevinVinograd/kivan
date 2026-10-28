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
import {
  formatCurrency,
  formatPercent,
  formatHours,
  formatRelativeDate,
  profitabilityStatusBadge,
} from './reports-format'
import type { FilterField } from './cobranza-format'
import type { ClientProfitabilityReportItem } from './reports-types'

export type ProfitabilityRowActions = {
  onView: (item: ClientProfitabilityReportItem) => void
  onGoToClient: (item: ClientProfitabilityReportItem) => void
  onGoToMonthly: (item: ClientProfitabilityReportItem) => void
  onGoToFinance: (item: ClientProfitabilityReportItem) => void
}

const equalsFilter: FilterFn<ClientProfitabilityReportItem> = (row, columnId, value) =>
  !value || row.getValue(columnId) === value

const teamFilter: FilterFn<ClientProfitabilityReportItem> = (row, _columnId, value) =>
  !value || row.original.team.includes(String(value))

export function profitabilitySearchText(item: ClientProfitabilityReportItem): string {
  return [item.clientName, item.clientType, item.service, ...item.team].join(' ').toLowerCase()
}

const uniqueOptions = (values: string[]) =>
  Array.from(new Set(values.filter(Boolean)))
    .sort()
    .map((value) => ({ value, label: value }))

/** Filter axes for the rentabilidad toolbar (período is the global header control). */
export function rentabilidadFilterFields(items: ClientProfitabilityReportItem[]): FilterField[] {
  return [
    { id: 'clientName', label: 'Cliente', options: uniqueOptions(items.map((i) => i.clientName)) },
    {
      id: 'clientType',
      label: 'Tipo de cliente',
      options: uniqueOptions(items.map((i) => i.clientType ?? '')),
    },
    { id: 'service', label: 'Servicio', options: uniqueOptions(items.map((i) => i.service)) },
    { id: 'team', label: 'Equipo asignado', options: uniqueOptions(items.flatMap((i) => i.team)) },
    {
      id: 'paymentState',
      label: 'Estado de pago',
      options: [
        { value: 'pendiente', label: 'Pendiente' },
        { value: 'al_dia', label: 'Al día' },
      ],
    },
  ]
}

function marginTone(margen: number): string {
  if (margen < 0) return 'fg-danger'
  if (margen < 22) return 'fg-warning'
  return 'fg-success'
}

export function rentabilidadColumns(
  actions: ProfitabilityRowActions,
): ColumnDef<ClientProfitabilityReportItem>[] {
  return [
    {
      accessorKey: 'clientName',
      id: 'clientName',
      header: 'Cliente',
      meta: { mobile: 'title' },
      filterFn: equalsFilter,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="type-button fg-default">{row.original.clientName}</span>
          {row.original.clientType ? (
            <span className="type-caption fg-subtle">{row.original.clientType}</span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'ingresos',
      id: 'ingresos',
      header: 'Ingresos',
      cell: ({ row }) => <span className="tabular-nums fg-default">{formatCurrency(row.original.ingresos)}</span>,
    },
    {
      accessorKey: 'costos',
      id: 'costos',
      header: 'Costos',
      cell: ({ row }) => <span className="tabular-nums fg-default">{formatCurrency(row.original.costos)}</span>,
    },
    {
      accessorKey: 'rentabilidad',
      id: 'rentabilidad',
      header: 'Rentabilidad',
      meta: { mobile: 'secondary' },
      cell: ({ row }) => (
        <span className={cn('tabular-nums', row.original.rentabilidad >= 0 ? 'fg-success' : 'fg-danger')}>
          {formatCurrency(row.original.rentabilidad)}
        </span>
      ),
    },
    {
      accessorKey: 'margen',
      id: 'margen',
      header: 'Margen',
      meta: { mobile: 'secondary' },
      cell: ({ row }) => (
        <span className={cn('tabular-nums', marginTone(row.original.margen))}>
          {formatPercent(row.original.margen)}
        </span>
      ),
    },
    {
      accessorKey: 'horas',
      id: 'horas',
      header: 'Horas',
      cell: ({ row }) => <span className="tabular-nums fg-default">{formatHours(row.original.horas)}</span>,
    },
    {
      accessorKey: 'lastIncreaseDate',
      id: 'lastIncreaseDate',
      header: 'Último aumento',
      cell: ({ row }) => (
        <span className="type-body-2 fg-subtle">{formatRelativeDate(row.original.lastIncreaseDate)}</span>
      ),
    },
    {
      accessorKey: 'status',
      id: 'status',
      header: 'Estado',
      meta: { mobile: 'badge' },
      enableSorting: false,
      cell: ({ row }) => {
        const badge = profitabilityStatusBadge(row.original.status)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    // Filter-only column for the Tipo de cliente axis (hidden in the table).
    {
      id: 'clientType',
      accessorFn: (row) => row.clientType ?? '',
      filterFn: equalsFilter,
      enableHiding: true,
      header: () => null,
      cell: () => null,
    },
    // Filter-only column for the Estado de pago axis (hidden in the table).
    {
      id: 'paymentState',
      accessorFn: (row) => (row.paymentPending ? 'pendiente' : 'al_dia'),
      filterFn: equalsFilter,
      enableHiding: true,
      header: () => null,
      cell: () => null,
    },
    // Filter-only column for the Equipo asignado axis.
    {
      id: 'team',
      accessorFn: (row) => row.team.join(', '),
      filterFn: teamFilter,
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
                aria-label="Acciones del cliente"
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
                <DropdownMenuItem onSelect={() => actions.onGoToClient(item)}>
                  <ICON.clients aria-hidden />
                  Ver cliente
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onGoToMonthly(item)}>
                  <ICON.monthlyOperation aria-hidden />
                  Ver operación mensual
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onGoToFinance(item)}>
                  <ICON.finance aria-hidden />
                  Ver cobros
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}
