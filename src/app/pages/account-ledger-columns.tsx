import type { ColumnDef } from '@tanstack/react-table'

import { cn } from '@/app/lib/utils'
import { Badge } from '@/app/components/components'
import { formatCurrency, formatShortDate } from './account-ledger-format'
import type { AccountEntity, AccountStatus, LedgerEntityType } from './account-ledger-types'

type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'outline'

export function accountStatusBadge(
  status: AccountStatus,
  entityType: LedgerEntityType,
): { label: string; variant: BadgeVariant } {
  if (status === 'paid' || status === 'collected') {
    return { label: entityType === 'client' ? 'Cobrado' : 'Pagado', variant: 'success' }
  }
  if (status === 'partial') return { label: 'Parcial', variant: 'warning' }
  return { label: 'Pendiente', variant: 'neutral' }
}

function balanceCell(value: number, otherLaneCount: number) {
  return (
    <span className='flex flex-col'>
      <span className={cn('tabular-nums', value <= 0 ? 'fg-subtle' : 'fg-default')}>
        {formatCurrency(value)}
      </span>
      {otherLaneCount > 0 ? (
        <span className='type-caption fg-subtle'>
          {otherLaneCount === 1 ? '1 movimiento' : otherLaneCount + ' movimientos'} en otra moneda
        </span>
      ) : null}
    </span>
  )
}

function accountColumns(
  entityType: LedgerEntityType,
  nameHeader: string,
  lastHeader: string,
): ColumnDef<AccountEntity>[] {
  return [
    {
      accessorKey: 'name',
      id: 'name',
      header: nameHeader,
      meta: { mobile: 'title' },
      cell: ({ row }) => <span className="type-button fg-default">{row.original.name}</span>,
    },
    {
      accessorKey: 'currentBalance',
      id: 'currentBalance',
      header: 'Saldo actual',
      meta: { mobile: 'secondary' },
      cell: ({ row }) => balanceCell(row.original.currentBalance, row.original.otherLaneCount),
    },
    {
      accessorKey: 'status',
      id: 'status',
      header: 'Estado',
      meta: { mobile: 'badge' },
      cell: ({ row }) => {
        const badge = accountStatusBadge(row.original.status, entityType)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    {
      accessorKey: 'lastMovementAt',
      id: 'lastMovementAt',
      header: lastHeader,
      meta: { mobile: 'secondary' },
      cell: ({ row }) => (
        <span className="type-body-2 tabular-nums fg-default">
          {row.original.lastMovementAt ? formatShortDate(row.original.lastMovementAt) : '—'}
        </span>
      ),
    },
  ]
}

export const clientLedgerColumns: ColumnDef<AccountEntity>[] = accountColumns(
  'client',
  'Cliente',
  'Último movimiento',
)

export const teamLedgerColumns: ColumnDef<AccountEntity>[] = accountColumns(
  'teamMember',
  'Colaboradora',
  'Último movimiento',
)

export const providerLedgerColumns: ColumnDef<AccountEntity>[] = accountColumns(
  'provider',
  'Proveedor',
  'Último movimiento',
)
