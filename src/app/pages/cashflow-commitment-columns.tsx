import type { ColumnDef } from '@tanstack/react-table'

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
import { formatMoney, formatShortDate } from './cobranza-format'
import type { CommittedItem } from './treasury-mock-data'
import { entityTypeFor } from './treasury-mock-data'
import {
  COMMITTED_CATEGORY_LABEL,
  CONFIDENCE_LABEL,
  DIRECTION_LABEL,
  RECURRENCE_LABEL,
  SOURCE_LABEL,
} from './treasury-view'

export type CommitmentRowActions = {
  onEdit: (item: CommittedItem) => void
  onDelete: (item: CommittedItem) => void
}

function isUnlinked(item: CommittedItem): boolean {
  if (!entityTypeFor(item.category, item.direction)) return false
  return !(item.linkedEntityType && item.linkedEntityId)
}

export function committedItemColumns(actions: CommitmentRowActions): ColumnDef<CommittedItem>[] {
  return [
    {
      accessorKey: 'description',
      id: 'description',
      header: 'Descripción',
      meta: { mobile: 'title' },
      cell: ({ row }) => (
        <span className={cn('type-button', row.original.isActive ? 'fg-default' : 'fg-subtle')}>
          {row.original.description}
        </span>
      ),
    },
    {
      accessorKey: 'direction',
      id: 'direction',
      header: 'Tipo',
      meta: { mobile: 'badge' },
      cell: ({ row }) => (
        <Badge variant={row.original.direction === 'inflow' ? 'success' : 'neutral'}>
          {DIRECTION_LABEL[row.original.direction]}
        </Badge>
      ),
    },
    {
      accessorKey: 'category',
      id: 'category',
      header: 'Categoría',
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <span className="type-body-2 fg-default">
            {COMMITTED_CATEGORY_LABEL[row.original.category]}
          </span>
          {isUnlinked(row.original) ? (
            <Badge variant="outline">Sin vincular</Badge>
          ) : null}
        </span>
      ),
    },
    {
      accessorKey: 'amount',
      id: 'amount',
      header: 'Monto',
      meta: { mobile: 'secondary' },
      cell: ({ row }) => (
        <span className="tabular-nums fg-default">
          {formatMoney(row.original.amount, row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'recurrence',
      id: 'recurrence',
      header: 'Frecuencia',
      cell: ({ row }) => (
        <span className="type-body-2 fg-default">{RECURRENCE_LABEL[row.original.recurrence]}</span>
      ),
    },
    {
      accessorKey: 'startDate',
      id: 'startDate',
      header: 'Desde',
      cell: ({ row }) => (
        <span className="type-body-2 tabular-nums fg-default">{formatShortDate(row.original.startDate)}</span>
      ),
    },
    {
      accessorKey: 'anchorDay',
      id: 'anchorDay',
      header: 'Día',
      cell: ({ row }) => <span className="tabular-nums fg-default">{row.original.anchorDay}</span>,
    },
    {
      accessorKey: 'confidence',
      id: 'confidence',
      header: 'Confianza',
      cell: ({ row }) => (
        <Badge variant={row.original.confidence === 'committed' ? 'primary' : 'outline'}>
          {CONFIDENCE_LABEL[row.original.confidence]}
        </Badge>
      ),
    },
    {
      accessorKey: 'source',
      id: 'source',
      header: 'Origen',
      cell: ({ row }) => (
        <Badge variant="neutral">{SOURCE_LABEL[row.original.source]}</Badge>
      ),
    },
    {
      accessorKey: 'isActive',
      id: 'isActive',
      header: 'Estado',
      meta: { mobile: 'badge' },
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'success' : 'outline'}>
          {row.original.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Acciones del compromiso"
                className={cn(
                  buttonVariants({ variant: 'transparent', color: 'primary' }),
                  'size-8 shrink-0',
                )}
              >
                <AFFORDANCE.overflow className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => actions.onEdit(item)}>
                  <ICON.edit aria-hidden />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(item)}>
                  <ICON.delete aria-hidden />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}
