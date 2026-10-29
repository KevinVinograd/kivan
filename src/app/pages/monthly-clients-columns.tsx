import type { ColumnDef } from '@tanstack/react-table'

import { cn } from '@/app/lib/utils'
import { AFFORDANCE, ICON } from '@/app/lib/icon-registry'
import {
  Avatar,
  AvatarFallback,
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
import type { ClientMonth } from './monthly-operation-mock-data'
import {
  MONOTRIBUTO_LABEL,
  NO_VALUE,
  clientExtrasTotal,
  clientMargin,
  clientMarginPercent,
  clientMonthStatusBadge,
  clientTotalToBill,
  formatCompactCurrency,
  formatCurrency,
  initials,
  invoiceBadge,
  marginTone,
  paymentBadge,
} from './monthly-operation-format'

const MARGIN_TONE_FG: Record<'default' | 'warning' | 'danger', string> = {
  default: 'fg-default',
  warning: 'fg-warning',
  danger: 'fg-danger',
}

export function clientRowAlert(client: ClientMonth): { label: string; tone: 'danger' | 'warning' } | null {
  if (client.paymentStatus === 'overdue') return { label: 'Pago vencido', tone: 'danger' }
  const margin = clientMargin(client)
  if (margin !== null && margin < 0) return { label: 'Margen negativo', tone: 'danger' }
  if (client.monthStatus === 'reviewed' && client.invoiceStatus === 'not_issued')
    return { label: 'Sin factura', tone: 'warning' }
  if ((client.monthStatus === 'new' || client.monthStatus === 'churned') && !client.effectiveDate)
    return { label: 'Falta fecha', tone: 'warning' }
  return null
}

export type MonthlyClientRowActions = {
  onView: (client: ClientMonth) => void
  onRegisterPayment: (client: ClientMonth) => void
  onMarkInvoiced: (client: ClientMonth) => void
  onIssueInvoice: (client: ClientMonth) => void
  onAddExtra: (client: ClientMonth) => void
  onAddAdjustment: (client: ClientMonth) => void
  onAddNote: (client: ClientMonth) => void
  onReviewProfitability: (client: ClientMonth) => void
  onSetEffectiveDate: (client: ClientMonth) => void
}

function currencyOrDash(value: number | null): string {
  return value !== null && value > 0 ? formatCurrency(value) : NO_VALUE
}

export function monthlyClientColumns(
  actions: MonthlyClientRowActions,
  locked: boolean,
): ColumnDef<ClientMonth>[] {
  return [
    {
      accessorKey: 'name',
      id: 'name',
      header: 'Cliente',
      meta: { mobile: 'title' },
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="type-button fg-default">{row.original.name}</span>
          {row.original.clientType ? (
            <span className="type-caption fg-subtle">{row.original.clientType}</span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'monthStatus',
      header: 'Estado del mes',
      meta: { mobile: 'badge' },
      accessorFn: (client) => client.monthStatus,
      cell: ({ row }) => {
        const badge = clientMonthStatusBadge(row.original.monthStatus)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    {
      id: 'team',
      header: 'Equipo asignado',
      enableSorting: false,
      cell: ({ row }) => {
        const team = row.original.team
        if (team.length === 0) return <span className="fg-subtle">{NO_VALUE}</span>
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                {team.slice(0, 3).map((member) => (
                  <Avatar key={member.id} size="sm">
                    <AvatarFallback>{initials(member.name)}</AvatarFallback>
                  </Avatar>
                ))}
                {team.length > 3 ? (
                  <Avatar size="sm">
                    <AvatarFallback>{`+${team.length - 3}`}</AvatarFallback>
                  </Avatar>
                ) : null}
              </div>
            </TooltipTrigger>
            <TooltipContent>{team.map((member) => member.name).join(', ')}</TooltipContent>
          </Tooltip>
        )
      },
    },
    {
      accessorKey: 'monthlyFee',
      id: 'monthlyFee',
      header: 'Fee mensual',
      cell: ({ row }) => (
        <span className="tabular-nums fg-default">{formatCurrency(row.original.monthlyFee)}</span>
      ),
    },
    {
      id: 'extras',
      header: 'Extras/fuera de scope',
      accessorFn: (client) => clientExtrasTotal(client),
      cell: ({ row }) => {
        const total = clientExtrasTotal(row.original)
        const count = row.original.extras.length
        if (count === 0) return <span className="fg-subtle">{NO_VALUE}</span>
        return (
          <div className="flex flex-col">
            <span className="tabular-nums fg-default">{formatCurrency(total)}</span>
            <span className="type-caption fg-subtle">{count === 1 ? '1 extra' : `${count} extras`}</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'productionsAmount',
      id: 'productions',
      header: 'Producciones',
      cell: ({ row }) => (
        <span className="tabular-nums fg-default">{currencyOrDash(row.original.productionsAmount)}</span>
      ),
    },
    {
      id: 'totalToBill',
      header: 'Total a facturar',
      meta: { mobile: 'secondary' },
      accessorFn: (client) => clientTotalToBill(client),
      cell: ({ row }) => (
        <span className="tabular-nums fg-default">{formatCurrency(clientTotalToBill(row.original))}</span>
      ),
    },
    {
      id: 'payment',
      header: 'Cobro',
      accessorFn: (client) => client.paymentStatus,
      cell: ({ row }) => {
        const badge = paymentBadge(row.original.paymentStatus)
        return (
          <div className="flex flex-col gap-0.5">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {row.original.paidAmount > 0 ? (
              <span className="type-caption fg-subtle tabular-nums">
                {formatCurrency(row.original.paidAmount)}
              </span>
            ) : null}
          </div>
        )
      },
    },
    {
      id: 'invoice',
      header: 'Facturación',
      accessorFn: (client) => client.invoiceStatus,
      cell: ({ row }) => {
        const badge = invoiceBadge(row.original.invoiceStatus)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    {
      id: 'monotributo',
      header: 'Monotributo',
      accessorFn: (client) => client.monotributo,
      cell: ({ row }) => <span className="fg-default">{MONOTRIBUTO_LABEL[row.original.monotributo]}</span>,
    },
    {
      accessorKey: 'teamCost',
      id: 'teamCost',
      header: 'Costo equipo',
      cell: ({ row }) => (
        <span className="tabular-nums fg-default">{currencyOrDash(row.original.teamCost)}</span>
      ),
    },
    {
      accessorKey: 'productionCost',
      id: 'productionCost',
      header: 'Costo producción',
      cell: ({ row }) => (
        <span className="tabular-nums fg-default">{currencyOrDash(row.original.productionCost)}</span>
      ),
    },
    {
      id: 'margin',
      header: 'Margen',
      meta: { mobile: 'secondary' },
      accessorFn: (client) => clientMargin(client),
      cell: ({ row }) => {
        const value = clientMargin(row.original)
        if (value === null) return <span className="tabular-nums fg-subtle">{NO_VALUE}</span>
        const tone = marginTone(clientMarginPercent(row.original))
        return <span className={cn('tabular-nums', MARGIN_TONE_FG[tone])}>{formatCompactCurrency(value)}</span>
      },
    },
    {
      id: 'alerts',
      header: 'Alertas',
      enableSorting: false,
      cell: ({ row }) => {
        const alert = clientRowAlert(row.original)
        if (!alert) return <span className="fg-subtle">{NO_VALUE}</span>
        return <Badge variant={alert.tone === 'danger' ? 'danger' : 'warning'}>{alert.label}</Badge>
      },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const client = row.original
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
                <DropdownMenuItem onSelect={() => actions.onView(client)}>
                  <ICON.view aria-hidden />
                  Ver detalle
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {client.monthStatus === 'new' || client.monthStatus === 'churned' ? (
                  <>
                    <DropdownMenuItem disabled={locked} onSelect={() => actions.onSetEffectiveDate(client)}>
                      <ICON.effectiveDate aria-hidden />
                      Definir fecha efectiva
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuItem disabled={locked} onSelect={() => actions.onRegisterPayment(client)}>
                  <ICON.payment aria-hidden />
                  Registrar cobro
                </DropdownMenuItem>
                <DropdownMenuItem disabled={locked} onSelect={() => actions.onMarkInvoiced(client)}>
                  <ICON.invoice aria-hidden />
                  Marcar como facturado
                </DropdownMenuItem>
                <DropdownMenuItem disabled={locked} onSelect={() => actions.onIssueInvoice(client)}>
                  <ICON.invoice aria-hidden />
                  Facturar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={locked} onSelect={() => actions.onAddExtra(client)}>
                  <ICON.addExtraWork aria-hidden />
                  Agregar extra
                </DropdownMenuItem>
                <DropdownMenuItem disabled={locked} onSelect={() => actions.onAddAdjustment(client)}>
                  <AFFORDANCE.create aria-hidden />
                  Agregar ajuste
                </DropdownMenuItem>
                <DropdownMenuItem disabled={locked} onSelect={() => actions.onAddNote(client)}>
                  <ICON.feedback aria-hidden />
                  Agregar nota
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={locked || client.monthStatus !== 'pending_review'}
                  onSelect={() => actions.onReviewProfitability(client)}
                >
                  <ICON.compensation aria-hidden />
                  Revisar rentabilidad
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}
