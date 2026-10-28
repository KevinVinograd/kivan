import type { ColumnDef, FilterFn } from '@tanstack/react-table'

import { cn } from '@/app/lib/utils'
import { LANE_NOUN } from '@/lib/currency'
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
import { formatMoney, formatMonthYear, formatRelativeDate, formatShortDate } from './cobranza-format'
import {
  isPaymentOverdue,
  paymentMethodLabel,
  paymentStatusBadge,
  RECIPIENT_TYPE_LABEL,
} from './pagos-format'
import type { Payment } from './pagos-mock-data'

/** Contextual row actions, wired by the tab (stubbed with toast in slice 1). */
export type PagosRowActions = {
  onView: (payment: Payment) => void
  onApprove: (payment: Payment) => void
  onMarkPaid: (payment: Payment) => void
  onEdit: (payment: Payment) => void
  onCancel: (payment: Payment) => void
}

const equalsFilter: FilterFn<Payment> = (row, columnId, value) =>
  !value || row.getValue(columnId) === value

export function pagosColumns(actions: PagosRowActions): ColumnDef<Payment>[] {
  return [
    {
      accessorKey: 'recipientName',
      id: 'recipientName',
      header: 'Destinatario',
      meta: { mobile: 'title' },
      cell: ({ row }) => <span className="type-button fg-default">{row.original.recipientName}</span>,
    },
    {
      accessorKey: 'recipientType',
      id: 'recipientType',
      header: 'Tipo',
      enableSorting: false,
      filterFn: equalsFilter,
      cell: ({ row }) => (
        <span className="type-body-2 fg-default">{RECIPIENT_TYPE_LABEL[row.original.recipientType]}</span>
      ),
    },
    {
      accessorKey: 'period',
      id: 'period',
      header: 'Período',
      cell: ({ row }) => <span className="type-body-2 fg-default">{formatMonthYear(row.original.period)}</span>,
    },
    {
      accessorKey: 'concept',
      id: 'concept',
      header: 'Concepto',
      enableSorting: false,
      cell: ({ row }) => <span className="type-body-2 fg-default">{row.original.concept}</span>,
    },
    {
      accessorKey: 'totalAmount',
      id: 'totalAmount',
      header: 'Monto',
      meta: { mobile: 'secondary' },
      cell: ({ row }) => (
        <span className="tabular-nums fg-default">
          {formatMoney(row.original.totalAmount, row.original.currency)}
        </span>
      ),
    },
    {
      // HIDDEN BY DEFAULT, and it exists for the filter rather than for the eye: the
      // toolbar targets a filter by COLUMN id, and `Monto` already carries each row's
      // lane through `formatMoney`, so a visible currency column would repeat it. Hiding
      // it is what lets `Moneda` isolate a lane and answer "how much of the dollar total
      // is overdue" from the rows, which the summary card deliberately does not.
      accessorKey: 'currency',
      id: 'currency',
      header: 'Moneda',
      cell: ({ row }) => <span className="fg-subtle">{LANE_NOUN[row.original.currency]}</span>,
    },
    {
      accessorKey: 'status',
      id: 'status',
      header: 'Estado',
      meta: { mobile: 'badge' },
      filterFn: equalsFilter,
      cell: ({ row }) => {
        const badge = paymentStatusBadge(row.original.status)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    {
      accessorKey: 'expectedDate',
      id: 'expectedDate',
      header: 'Fecha prevista',
      meta: { mobile: 'secondary' },
      cell: ({ row }) => (
        <span
          className={cn(
            'type-body-2 tabular-nums',
            isPaymentOverdue(row.original) ? 'fg-danger' : 'fg-default',
          )}
        >
          {formatShortDate(row.original.expectedDate)}
        </span>
      ),
    },
    {
      accessorKey: 'paymentDate',
      id: 'paymentDate',
      header: 'Fecha de pago',
      cell: ({ row }) => {
        const iso = row.original.paymentDate
        return (
          <span className={cn('type-body-2 tabular-nums', iso ? 'fg-default' : 'fg-subtle')}>
            {iso ? formatShortDate(iso) : 'Sin pago'}
          </span>
        )
      },
    },
    {
      id: 'method',
      header: 'Medio de pago',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="type-body-2 fg-default">{paymentMethodLabel(row.original.method)}</span>
      ),
    },
    {
      id: 'accountAlias',
      header: 'Cuenta / alias',
      enableSorting: false,
      cell: ({ row }) => {
        const alias = row.original.accountAlias
        return (
          <span className={cn('type-body-2', alias ? 'fg-default' : 'fg-subtle')}>
            {alias ?? 'Sin datos'}
          </span>
        )
      },
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
        const payment = row.original
        return (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Acciones del pago"
                className={cn(
                  buttonVariants({ variant: 'transparent', color: 'primary' }),
                  'size-8 shrink-0',
                )}
              >
                <AFFORDANCE.overflow className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => actions.onView(payment)}>
                  <ICON.view aria-hidden />
                  Ver detalle
                </DropdownMenuItem>
                {payment.status !== 'cancelled' ? (
                  <>
                    <DropdownMenuSeparator />
                    {payment.status === 'pending' ? (
                      <DropdownMenuItem onSelect={() => actions.onApprove(payment)}>
                        <ICON.approvePayment aria-hidden />
                        Aprobar pago
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onSelect={() => actions.onMarkPaid(payment)}>
                      <ICON.payment aria-hidden />
                      Marcar como pagado
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => actions.onEdit(payment)}>
                      <ICON.edit aria-hidden />
                      Editar pago
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => actions.onCancel(payment)}>
                      <AFFORDANCE.close aria-hidden />
                      Cancelar pago
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
