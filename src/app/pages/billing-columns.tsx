import type { ColumnDef, FilterFn } from '@tanstack/react-table'

import { cn } from '@/app/lib/utils'
import { AFFORDANCE, ICON } from '@/app/lib/icon-registry'
import { LANE_NOUN } from '@/lib/currency'
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
  NO_VALUE,
  TAX_PROFILE_SHORT_LABEL,
} from './cobranza-format'
import { billingStatusBadge, receivableInvoiceDate } from './cobros-format'
import { canInvoice, isBilled } from './cobros-invoice'
import type { Receivable } from './cobros-mock-data'

export type BillingRowActions = {
  onView: (receivable: Receivable) => void
  onGenerateInvoice: (receivable: Receivable) => void
  onAssociateInvoice: (receivable: Receivable) => void
  onSend: (receivable: Receivable) => void
  onEditFiscalData: (receivable: Receivable) => void
}

const equalsFilter: FilterFn<Receivable> = (row, columnId, value) =>
  !value || row.getValue(columnId) === value

function emitterShortLabel(receivable: Receivable): string {
  return TAX_PROFILE_SHORT_LABEL[receivable.emitterTaxProfile ?? receivable.taxProfileId]
}

export function billingColumns(actions: BillingRowActions): ColumnDef<Receivable>[] {
  return [
    {
      accessorKey: 'clientName',
      id: 'clientName',
      header: 'Cliente',
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
      cell: ({ row }) => (
        <span className="type-body-2 fg-default">{formatMonthYear(row.original.period)}</span>
      ),
    },
    {
      accessorKey: 'totalAmount',
      id: 'totalAmount',
      header: 'Monto',
      cell: ({ row }) => (
        <span className="tabular-nums fg-default">
          {formatMoney(row.original.totalAmount, row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'currency',
      id: 'currency',
      header: 'Moneda',
      filterFn: equalsFilter,
      cell: ({ row }) => <span className="fg-subtle">{LANE_NOUN[row.original.currency]}</span>,
    },
    {
      accessorKey: 'billingStatus',
      id: 'billingStatus',
      header: 'Estado de facturación',
      filterFn: equalsFilter,
      cell: ({ row }) => {
        const badge = billingStatusBadge(row.original.billingStatus)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    {
      accessorKey: 'taxProfileId',
      id: 'taxProfileId',
      header: 'Monotributo',
      enableSorting: false,
      filterFn: equalsFilter,
      cell: ({ row }) => (
        <span className="type-body-2 fg-default">{emitterShortLabel(row.original)}</span>
      ),
    },
    {
      accessorKey: 'invoiceNumber',
      id: 'invoiceNumber',
      header: 'Nº factura',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="type-body-2 tabular-nums fg-default">
          {row.original.invoiceNumber ?? NO_VALUE}
        </span>
      ),
    },
    {
      id: 'cae',
      header: 'CAE',
      enableSorting: false,
      accessorFn: (row) => row.cae ?? NO_VALUE,
      cell: ({ row }) => (
        <span className="type-body-2 tabular-nums fg-subtle">{row.original.cae ?? NO_VALUE}</span>
      ),
    },
    {
      id: 'emission',
      header: 'Emisión',
      enableSorting: false,
      cell: ({ row }) => {
        const iso = receivableInvoiceDate(row.original)
        return (
          <span className="type-body-2 tabular-nums fg-default">
            {iso ? formatRelativeDate(iso) : NO_VALUE}
          </span>
        )
      },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const receivable = row.original
        const errorArca = receivable.billingStatus === 'error_arca'
        const pendingData = receivable.billingStatus === 'pending'
        return (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Acciones de facturación"
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
                <DropdownMenuSeparator />
                {canInvoice(receivable) ? (
                  <>
                    <DropdownMenuItem onSelect={() => actions.onGenerateInvoice(receivable)}>
                      <ICON.invoice aria-hidden />
                      {errorArca ? 'Reintentar factura' : 'Generar factura'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => actions.onAssociateInvoice(receivable)}>
                      <ICON.invoice aria-hidden />
                      Asociar factura
                    </DropdownMenuItem>
                    {errorArca || pendingData ? (
                      <DropdownMenuItem onSelect={() => actions.onEditFiscalData(receivable)}>
                        <ICON.edit aria-hidden />
                        Editar datos fiscales
                      </DropdownMenuItem>
                    ) : null}
                  </>
                ) : null}
                {isBilled(receivable) ? (
                  <DropdownMenuItem onSelect={() => actions.onSend(receivable)}>
                    <ICON.sendStatement aria-hidden />
                    Enviar
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}
