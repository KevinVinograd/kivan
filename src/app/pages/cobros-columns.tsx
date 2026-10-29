import { LANE_NOUN } from '@/lib/currency'
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
  formatMoney,
  formatMonthYear,
  formatRelativeDate,
  formatShortDate,
  TAX_PROFILE_SHORT_LABEL,
} from './cobranza-format'
import {
  balanceOf,
  billingStatusBadge,
  collectionStatusBadge,
  effectiveCollectionStatus,
  isOverdue,
} from './cobros-format'
import { canInvoice, isBilled } from './cobros-invoice'
import type { Receivable } from './cobros-mock-data'

export type CobrosRowActions = {
  onView: (receivable: Receivable) => void
  onGenerateInvoice: (receivable: Receivable) => void
  onAssociateInvoice: (receivable: Receivable) => void
  onSendStatement: (receivable: Receivable) => void
  onMarkCollected: (receivable: Receivable) => void
  onEdit: (receivable: Receivable) => void
  onCancel: (receivable: Receivable) => void
}

const equalsFilter: FilterFn<Receivable> = (row, columnId, value) =>
  !value || row.getValue(columnId) === value

export function cobrosColumns(actions: CobrosRowActions): ColumnDef<Receivable>[] {
  return [
    {
      accessorKey: 'clientName',
      id: 'clientName',
      header: 'Cliente',
      meta: { mobile: 'title' },
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
      accessorKey: 'period',
      id: 'period',
      header: 'Período',
      cell: ({ row }) => <span className="type-body-2 fg-default">{formatMonthYear(row.original.period)}</span>,
    },
    {
      accessorKey: 'service',
      id: 'service',
      header: 'Servicio',
      enableSorting: false,
      cell: ({ row }) => <span className="type-body-2 fg-default">{row.original.service}</span>,
    },
    {
      accessorKey: 'totalAmount',
      id: 'totalAmount',
      header: 'Monto a cobrar',
      meta: { mobile: 'secondary' },
      cell: ({ row }) => (
        <span className="tabular-nums fg-default">
          {formatMoney(row.original.totalAmount, row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'billingStatus',
      id: 'billingStatus',
      header: 'Facturación',
      filterFn: equalsFilter,
      cell: ({ row }) => {
        const badge = billingStatusBadge(row.original.billingStatus)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    {
      accessorKey: 'currency',
      id: 'currency',
      header: 'Moneda',
      cell: ({ row }) => <span className="fg-subtle">{LANE_NOUN[row.original.currency]}</span>,
    },
    {
      accessorFn: (r) => effectiveCollectionStatus(r),
      id: 'status',
      header: 'Estado de cobro',
      meta: { mobile: 'badge' },
      filterFn: equalsFilter,
      cell: ({ row }) => {
        const badge = collectionStatusBadge(effectiveCollectionStatus(row.original))
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    {
      accessorKey: 'dueDate',
      id: 'dueDate',
      header: 'Vencimiento',
      meta: { mobile: 'secondary' },
      cell: ({ row }) => (
        <span className={cn('type-body-2 tabular-nums', isOverdue(row.original) ? 'fg-danger' : 'fg-default')}>
          {formatShortDate(row.original.dueDate)}
        </span>
      ),
    },
    {
      accessorKey: 'collectedAmount',
      id: 'collectedAmount',
      header: 'Cobrado',
      cell: ({ row }) => (
        <span className="tabular-nums fg-default">
          {formatMoney(row.original.collectedAmount, row.original.currency)}
        </span>
      ),
    },
    {
      id: 'balance',
      header: 'Saldo',
      accessorFn: (row) => balanceOf(row),
      cell: ({ row }) => {
        const balance = balanceOf(row.original)
        return (
          <span
            className={cn(
              'tabular-nums',
              balance <= 0 ? 'fg-subtle' : isOverdue(row.original) ? 'fg-danger' : 'fg-default',
            )}
          >
            {formatMoney(balance, row.original.currency)}
          </span>
        )
      },
    },
    {
      accessorKey: 'taxProfileId',
      id: 'taxProfileId',
      header: 'Monotributo',
      enableSorting: false,
      filterFn: equalsFilter,
      cell: ({ row }) => (
        <span className="type-body-2 fg-default">{TAX_PROFILE_SHORT_LABEL[row.original.taxProfileId]}</span>
      ),
    },
    {
      id: 'lastActivity',
      header: 'Última actividad',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="type-body-2 fg-default">{row.original.lastActivityLabel}</span>
          <span className="type-caption fg-subtle">{formatRelativeDate(row.original.lastActivityAt)}</span>
        </div>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const receivable = row.original
        return (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Acciones del cobro"
                className={cn(
                  buttonVariants({ variant: 'transparent', color: 'primary' }),
                  'size-8 shrink-0',
                )}
              >
                <AFFORDANCE.overflow className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => actions.onView(receivable)}>
                  <ICON.view aria-hidden />
                  Ver detalle
                </DropdownMenuItem>
                {receivable.status !== 'cancelled' ? (
                  <>
                    <DropdownMenuSeparator />
                    {canInvoice(receivable) ? (
                      <>
                        <DropdownMenuItem onSelect={() => actions.onGenerateInvoice(receivable)}>
                          <ICON.invoice aria-hidden />
                          Generar factura
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => actions.onAssociateInvoice(receivable)}>
                          <ICON.invoice aria-hidden />
                          Asociar factura
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    {isBilled(receivable) ? (
                      <DropdownMenuItem onSelect={() => actions.onSendStatement(receivable)}>
                        <ICON.sendStatement aria-hidden />
                        Enviar
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onSelect={() => actions.onMarkCollected(receivable)}>
                      <ICON.payment aria-hidden />
                      Marcar como cobrado
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => actions.onEdit(receivable)}>
                      <ICON.edit aria-hidden />
                      Editar cobro
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => actions.onCancel(receivable)}>
                      <AFFORDANCE.close aria-hidden />
                      Cancelar cobro
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}
