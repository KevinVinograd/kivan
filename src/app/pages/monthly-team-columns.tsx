import type { ColumnDef } from '@tanstack/react-table'

import { cn } from '@/app/lib/utils'
import { hasCapability, type Capability } from '@hold/shared'
import { AFFORDANCE, ICON } from '@/app/lib/icon-registry'
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  buttonVariants,
} from '@/app/components/components'
import type { TeamPayout } from './monthly-operation-mock-data'
import {
  NO_VALUE,
  bankComplete,
  bankLabel,
  formatCurrency,
  nextStatementAction,
  payoutAdjustmentsTotal,
  payoutBadge,
  payoutTotal,
  statementBadge,
} from './monthly-operation-format'

export function payoutRowAlert(payout: TeamPayout): { label: string; tone: 'danger' | 'warning' } | null {
  if (payoutTotal(payout) > 0 && !bankComplete(payout)) return { label: 'Datos bancarios', tone: 'danger' }
  if (payout.statementStatus === 'draft') return { label: 'Falta aprobar', tone: 'warning' }
  return null
}

export type MonthlyTeamRowActions = {
  onView: (payout: TeamPayout) => void
  onAdvanceStatement: (payout: TeamPayout) => void
  onRegisterPayout: (payout: TeamPayout) => void
  onAddAdjustment: (payout: TeamPayout) => void
  onEditBank: (payout: TeamPayout) => void
}

function currencyOrDash(value: number): string {
  return value > 0 ? formatCurrency(value) : NO_VALUE
}

export function monthlyTeamColumns(
  actions: MonthlyTeamRowActions,
  locked: boolean,
  capabilities: Capability[],
): ColumnDef<TeamPayout>[] {
  const showBank = hasCapability(capabilities, 'teamBankDetails')
  const columns: ColumnDef<TeamPayout>[] = [
    {
      accessorKey: 'name',
      id: 'name',
      header: 'Persona',
      meta: { mobile: 'title' },
      cell: ({ row }) => <span className="type-button fg-default">{row.original.name}</span>,
    },
    {
      accessorKey: 'role',
      id: 'role',
      header: 'Rol',
      cell: ({ row }) => <span className="fg-default">{row.original.role}</span>,
    },
    {
      id: 'clients',
      header: 'Clientes asignados',
      enableSorting: false,
      cell: ({ row }) => {
        const clients = row.original.clients
        if (clients.length === 0) return <span className="fg-subtle">{NO_VALUE}</span>
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="type-body-2 fg-default">
                {clients.length === 1 ? clients[0] : `${clients.length} clientes`}
              </span>
            </TooltipTrigger>
            <TooltipContent>{clients.join(', ')}</TooltipContent>
          </Tooltip>
        )
      },
    },
    {
      accessorKey: 'baseAmount',
      id: 'baseAmount',
      header: 'Base mensual',
      cell: ({ row }) => (
        <span className="tabular-nums fg-default">{currencyOrDash(row.original.baseAmount)}</span>
      ),
    },
    {
      accessorKey: 'productionsAmount',
      id: 'productionsAmount',
      header: 'Producciones',
      cell: ({ row }) => (
        <span className="tabular-nums fg-default">{currencyOrDash(row.original.productionsAmount)}</span>
      ),
    },
    {
      accessorKey: 'viaticsAmount',
      id: 'viaticsAmount',
      header: 'Viáticos',
      cell: ({ row }) => (
        <span className="tabular-nums fg-default">{currencyOrDash(row.original.viaticsAmount)}</span>
      ),
    },
    {
      id: 'adjustments',
      header: 'Extras/ajustes',
      accessorFn: (payout) => payoutAdjustmentsTotal(payout),
      cell: ({ row }) => (
        <span className="tabular-nums fg-default">{currencyOrDash(payoutAdjustmentsTotal(row.original))}</span>
      ),
    },
    {
      id: 'total',
      header: 'Total a pagar',
      meta: { mobile: 'secondary' },
      accessorFn: (payout) => payoutTotal(payout),
      cell: ({ row }) => (
        <span className="type-button tabular-nums fg-default">{formatCurrency(payoutTotal(row.original))}</span>
      ),
    },
    {
      id: 'statement',
      header: 'Cuenta corriente',
      accessorFn: (payout) => payout.statementStatus,
      cell: ({ row }) => {
        const badge = statementBadge(row.original.statementStatus)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    {
      id: 'payout',
      header: 'Estado de pago',
      meta: { mobile: 'badge' },
      accessorFn: (payout) => payout.payoutStatus,
      cell: ({ row }) => {
        const badge = payoutBadge(row.original.payoutStatus)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    {
      id: 'bank',
      header: 'Datos bancarios',
      enableSorting: false,
      cell: ({ row }) => {
        const bank = bankLabel(row.original)
        return (
          <span className={cn('type-body-2', bank.complete ? 'fg-default' : 'fg-danger')}>{bank.label}</span>
        )
      },
    },
    {
      id: 'alerts',
      header: 'Alertas',
      enableSorting: false,
      cell: ({ row }) => {
        const alert = payoutRowAlert(row.original)
        if (!alert) return <span className="fg-subtle">{NO_VALUE}</span>
        return <Badge variant={alert.tone === 'danger' ? 'danger' : 'warning'}>{alert.label}</Badge>
      },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const payout = row.original
        const advance = nextStatementAction(payout.statementStatus)
        return (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Acciones del pago"
                className={cn(buttonVariants({ variant: 'transparent', color: 'primary' }), 'size-8 shrink-0')}
              >
                <AFFORDANCE.overflow className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => actions.onView(payout)}>
                  <ICON.view aria-hidden />
                  Ver detalle
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {advance ? (
                  <DropdownMenuItem disabled={locked} onSelect={() => actions.onAdvanceStatement(payout)}>
                    {advance.transition === 'dispatch' ? (
                      <ICON.sendStatement aria-hidden />
                    ) : (
                      <ICON.approvePayment aria-hidden />
                    )}
                    {advance.label}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem disabled={locked} onSelect={() => actions.onRegisterPayout(payout)}>
                  <ICON.payment aria-hidden />
                  Registrar pago
                </DropdownMenuItem>
                <DropdownMenuItem disabled={locked} onSelect={() => actions.onAddAdjustment(payout)}>
                  <AFFORDANCE.create aria-hidden />
                  Agregar ajuste
                </DropdownMenuItem>
                {showBank ? (
                  <DropdownMenuItem disabled={locked} onSelect={() => actions.onEditBank(payout)}>
                    <ICON.bankDetails aria-hidden />
                    Editar datos bancarios
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  return showBank ? columns : columns.filter((column) => column.id !== 'bank')
}
