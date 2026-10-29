import type { ColumnDef } from '@tanstack/react-table'
import { cn } from '@/app/lib/utils'
import { hasCapability, type Capability } from '@hold/shared'
import type { Role } from '@/app/lib/use-role'
import { AFFORDANCE, ICON } from '@/app/lib/icon-registry'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  badgeVariants,
  buttonVariants,
} from '@/app/components/components'
import type { TeamMember } from './clients-mock-data'
import type { TeamDataContextValue } from './team-data'
import {
  bankBadge,
  formatCurrency,
  formatRelativeDate,
  initials,
  loadBadge,
  paymentActionForStatus,
  paymentStatusBadge,
  teamStatusBadge,
  NO_RECORD,
} from './team-format'
import { LogProductionItem } from './log-production-item'

const MAX_CLIENTS = 2

export const COLUMN_LABELS: Record<string, string> = {
  person: 'Persona',
  clients: 'Clientes asignados',
  load: 'Carga mensual',
  productions: 'Producciones',
  extras: 'Extras',
  expenses: 'Viáticos',
  pay: 'Pago estimado',
  paymentStatus: 'Estado de pago',
  bank: 'Datos bancarios',
  lastUpdated: 'Última actualización',
}

export type TeamRowActions = {
  onView: (member: TeamMember) => void
  onEdit: (member: TeamMember) => void
  onLogHours: (member: TeamMember) => void
  onAddProduction: (member: TeamMember) => void
  onAddExpense: (member: TeamMember) => void
  onAddExtra: (member: TeamMember) => void
  onApprovePayment: (member: TeamMember) => void
  onPayDifference: (member: TeamMember) => void
  onConfirmPaid: (member: TeamMember) => void
  onDeactivate: (member: TeamMember) => void
}

const LOAD_ORDER = { overloaded: 4, high: 3, normal: 2, low: 1 } as const

export function teamColumns(
  actions: TeamRowActions,
  td: TeamDataContextValue,
  role: Role,
  capabilities: Capability[],
): ColumnDef<TeamMember>[] {
  const columns: ColumnDef<TeamMember>[] = [
    {
      id: 'select',
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <div className="flex size-6 items-center justify-center">
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Seleccionar todo"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div
          className="flex size-6 items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <Avatar
            size="sm"
            className="group-hover/row:hidden group-data-[state=selected]/row:hidden"
          >
            {row.original.avatarUrl ? (
              <AvatarImage src={row.original.avatarUrl} alt={row.original.name} />
            ) : null}
            <AvatarFallback>{initials(row.original.name)}</AvatarFallback>
          </Avatar>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Seleccionar fila"
            className="hidden group-hover/row:block group-data-[state=selected]/row:block"
          />
        </div>
      ),
    },
    {
      accessorKey: 'name',
      id: 'person',
      header: 'Persona',
      meta: { mobile: 'title' },
      cell: ({ row }) => {
        const member = row.original
        const status = teamStatusBadge(member.status)
        return (
          <div className="flex flex-col gap-0.5">
            <span className="type-button fg-default">{member.name}</span>
            <div className="flex items-center gap-1.5">
              <span className="type-caption fg-subtle">{member.role}</span>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
          </div>
        )
      },
    },
    {
      id: 'clients',
      header: 'Clientes asignados',
      meta: { mobile: 'secondary' },
      enableSorting: false,
      cell: ({ row }) => {
        const names = td.clientsForMember(row.original.id)
        if (names.length === 0) return <span className="fg-subtle">Sin clientes</span>
        const shown = names.slice(0, MAX_CLIENTS)
        const overflow = names.slice(MAX_CLIENTS)
        return (
          <div className="flex flex-wrap items-center gap-1">
            {shown.map((name) => (
              <Badge key={name} variant="outline" shape="pill">
                {name}
              </Badge>
            ))}
            {overflow.length > 0 ? (
              <Popover>
                <PopoverTrigger
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Ver ${overflow.length} clientes más`}
                  className={cn(
                    badgeVariants({ variant: 'neutral', shape: 'pill' }),
                    'cursor-pointer outline-none hover:bg-alpha-subtle-hover focus-visible:ring-2 focus-visible:ring-focus',
                  )}
                >
                  +{overflow.length}
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  onClick={(e) => e.stopPropagation()}
                  className="flex max-w-64 flex-wrap gap-1"
                >
                  {overflow.map((name) => (
                    <Badge key={name} variant="outline" shape="pill">
                      {name}
                    </Badge>
                  ))}
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        )
      },
    },
    {
      id: 'load',
      header: 'Carga mensual',
      meta: { mobile: 'badge' },
      accessorFn: (member) => {
        const status = td.loadStatusForMember(member.id)
        return status ? LOAD_ORDER[status] : 0
      },
      cell: ({ row }) => {
        const badge = loadBadge(td.loadStatusForMember(row.original.id))
        return (
          <div className="flex flex-col gap-0.5">
            <span className="type-body-2 fg-default tabular-nums">
              {td.loadHoursLabel(row.original.id)}
            </span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
        )
      },
    },
    {
      id: 'productions',
      header: 'Producciones',
      meta: { hideOnNarrow: true },
      accessorFn: (member) => td.productionsCountForMember(member.id),
      cell: ({ row }) => {
        const count = td.productionsCountForMember(row.original.id)
        return count > 0 ? (
          <span className="type-body-2 fg-default tabular-nums">
            {count} {count === 1 ? 'producción' : 'producciones'}
          </span>
        ) : (
          <span className="fg-subtle">{NO_RECORD}</span>
        )
      },
    },
    {
      id: 'extras',
      header: 'Extras',
      meta: { hideOnNarrow: true },
      enableSorting: false,
      cell: ({ row }) => {
        const extras = td.extrasDisplay(row.original.id)
        return (
          <div className="flex flex-col gap-0.5">
            <span className={cn('type-body-2', extras.pending ? 'fg-warning' : 'fg-subtle')}>
              {extras.label}
            </span>
            {extras.amount ? (
              <span className="type-caption fg-subtle tabular-nums">{extras.amount}</span>
            ) : null}
          </div>
        )
      },
    },
    {
      id: 'expenses',
      header: 'Viáticos',
      meta: { hideOnNarrow: true },
      accessorFn: (member) => td.expensesTotalForMember(member.id),
      cell: ({ row }) => {
        const total = td.expensesTotalForMember(row.original.id)
        return total > 0 ? (
          <span className="type-body-2 fg-default tabular-nums">{formatCurrency(total)}</span>
        ) : (
          <span className="fg-subtle">{NO_RECORD}</span>
        )
      },
    },
    {
      id: 'pay',
      header: 'Pago estimado',
      meta: { mobile: 'secondary' },
      accessorFn: (member) => td.estimatedPayForMember(member.id),
      cell: ({ row }) => {
        const statement = td.statementForMember(row.original.id)
        return (
          <span className="type-button fg-default tabular-nums">
            {statement ? formatCurrency(statement.totalAmount) : NO_RECORD}
          </span>
        )
      },
    },
    {
      id: 'paymentStatus',
      header: 'Estado de pago',
      enableSorting: false,
      cell: ({ row }) => {
        const statement = td.statementForMember(row.original.id)
        if (!statement) return <span className="fg-subtle">{NO_RECORD}</span>
        const badge = paymentStatusBadge(statement.status)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    {
      id: 'bank',
      header: 'Datos bancarios',
      enableSorting: false,
      cell: ({ row }) => {
        const badge = bankBadge(row.original)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    {
      id: 'lastUpdated',
      header: 'Última actualización',
      accessorFn: (member) => td.lastUpdatedForMember(member.id),
      cell: ({ row }) => (
        <span className="type-body-2 fg-subtle">
          {formatRelativeDate(td.lastUpdatedForMember(row.original.id))}
        </span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const member = row.original
        const statement = td.statementForMember(member.id)
        const paymentAction = paymentActionForStatus(statement?.status)
        return (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Acciones de la persona"
                className={cn(
                  buttonVariants({ variant: 'transparent', color: 'primary' }),
                  'size-8 shrink-0',
                )}
              >
                <AFFORDANCE.overflow className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => actions.onView(member)}>
                  <ICON.view aria-hidden />
                  Ver detalle
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => actions.onEdit(member)}>
                  <ICON.edit aria-hidden />
                  Editar persona
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onLogHours(member)}>
                  <ICON.logHours aria-hidden />
                  Cargar horas
                </DropdownMenuItem>
                <LogProductionItem onSelect={() => actions.onAddProduction(member)} />
                <DropdownMenuItem onSelect={() => actions.onAddExpense(member)}>
                  <ICON.expense aria-hidden />
                  Cargar viático
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onAddExtra(member)}>
                  <ICON.addExtraWork aria-hidden />
                  Cargar extra
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!paymentAction}
                  onSelect={() => {
                    if (paymentAction?.kind === 'payDifference') actions.onPayDifference(member)
                    else if (paymentAction?.kind === 'confirmPaid') actions.onConfirmPaid(member)
                    else actions.onApprovePayment(member)
                  }}
                >
                  <ICON.approvePayment aria-hidden />
                  {paymentAction?.label ?? (statement ? 'Pagado' : 'Sin plan del mes')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => actions.onDeactivate(member)}>
                  <ICON.churn aria-hidden />
                  Desactivar persona
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  if (role === 'employee') return columns.filter((column) => column.id !== 'select' && column.id !== 'actions')
  if (!hasCapability(capabilities, 'teamBankDetails')) return columns.filter((column) => column.id !== 'bank')
  return columns
}
