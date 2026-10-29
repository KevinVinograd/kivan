import type { ColumnDef, FilterFn } from '@tanstack/react-table'
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  badgeVariants,
  buttonVariants,
} from '@/app/components/components'
import type { Client } from './clients-mock-data'
import {
  BILLING_ENTITY_LABEL,
  NO_ACTION,
  NO_REGISTRO,
  clientStatusBadge,
  formatCurrency,
  formatRelativeDate,
  increaseInfo,
  initials,
  invoiceBadge,
  matchesIncreaseFilter,
  matchesMeetingFilter,
  paymentDisplay,
  profitabilityBadge,
  profitabilityStatusOf,
  type ClientFilterId,
  type IncreaseTone,
} from './clients-format'
import { riskLevelBadge } from './dashboard-format'
import type { RiskLevel } from './dashboard-types'
import { LogProductionItem, ViewProductionsItem } from './log-production-item'

const MAX_SERVICES = 2
const MAX_TEAM = 2

export const COLUMN_IDS = {
  risk: 'risk',
  status: 'status',
  paymentStatus: 'paymentStatus',
  profitability: 'profitability',
  services: 'services',
  monotributo: 'billing',
  lastIncreaseDate: 'lastIncreaseDate',
  lastMeetingDate: 'lastMeetingDate',
} as const satisfies Record<string, ClientFilterId>

export const COLUMN_LABELS: Record<string, string> = {
  name: 'Cliente',
  risk: 'Riesgo',
  status: 'Estado',
  services: 'Servicios',
  team: 'Equipo',
  monthlyFee: 'Fee mensual',
  paymentStatus: 'Pago del mes',
  profitability: 'Rentabilidad',
  lastIncreaseDate: 'Último aumento',
  lastMeetingDate: 'Última reunión',
  billing: 'Factura',
  nextAction: 'Próxima acción',
}

export type ClientRowActions = {
  onView: (client: Client) => void
  onEdit: (client: Client) => void
  onRegisterPayment: (client: Client) => void
  onIssueInvoice: (client: Client) => void
  onSendStatement: (client: Client) => void
  onAddExtraWork: (client: Client) => void
  onChurn: (client: Client) => void
  onDelete: (client: Client) => void
  onLogHours: (client: Client) => void
  onLogProduction: (client: Client) => void
  onLogExtra: (client: Client) => void
  onViewProductions: (client: Client) => void
}

const equalsFilter: FilterFn<Client> = (row, columnId, value) =>
  !value || row.getValue(columnId) === value

const servicesFilter: FilterFn<Client> = (row, _columnId, value) =>
  !value || row.original.services.includes(value as string)

const profitabilityFilter: FilterFn<Client> = (row, _columnId, value) =>
  !value || profitabilityStatusOf(row.original) === value

const billingEntityFilter: FilterFn<Client> = (row, _columnId, value) =>
  !value || row.original.billingEntity === value

const increaseFilter: FilterFn<Client> = (row, _columnId, value) =>
  !value || matchesIncreaseFilter(row.original.lastIncreaseDate, value as string)

const meetingFilter: FilterFn<Client> = (row, _columnId, value) =>
  !value || matchesMeetingFilter(row.original.lastMeetingDate, value as string)

const INCREASE_TONE_CLASS: Record<IncreaseTone, string> = {
  ok: 'fg-default',
  review: 'fg-warning',
  urgent: 'fg-danger',
  none: 'fg-subtle',
}

const EMPLOYEE_COLUMN_IDS = new Set(['name', 'risk', 'status', 'services', 'team', 'lastMeetingDate', 'nextAction'])

function employeeCargarColumn(actions: ClientRowActions): ColumnDef<Client> {
  return {
    id: 'cargar',
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => {
      const client = row.original
      return (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Cargar trabajo"
              className={cn(
                buttonVariants({ variant: 'outlined', color: 'primary' }),
                'h-8 gap-1.5 px-3',
              )}
            >
              <ICON.logWork className="size-4" aria-hidden />
              Cargar
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => actions.onLogHours(client)}>
                <ICON.logHours aria-hidden />
                Cargar horas
              </DropdownMenuItem>
              <LogProductionItem onSelect={() => actions.onLogProduction(client)} />
              <ViewProductionsItem onSelect={() => actions.onViewProductions(client)} />
              <DropdownMenuItem onSelect={() => actions.onLogExtra(client)}>
                <ICON.addExtraWork aria-hidden />
                Cargar trabajo extra
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    },
  }
}

export function clientColumns(
  actions: ClientRowActions,
  riskOf: (client: Client) => RiskLevel | null,
  role: Role,
  capabilities: Capability[],
): ColumnDef<Client>[] {
  const columns: ColumnDef<Client>[] = [
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
      id: COLUMN_IDS.risk,
      accessorFn: (client) => riskOf(client),
      header: 'Riesgo',
      filterFn: equalsFilter,
      enableSorting: false,
      cell: ({ getValue }) => {
        const level = getValue<RiskLevel | null>()
        if (!level) return <Badge variant="neutral">Sin datos</Badge>
        const { label, variant } = riskLevelBadge(level)
        return <Badge variant={variant}>{label}</Badge>
      },
    },
    {
      accessorKey: 'status',
      id: COLUMN_IDS.status,
      header: 'Estado',
      meta: { mobile: 'badge' },
      filterFn: equalsFilter,
      cell: ({ row }) => {
        const { label, variant } = clientStatusBadge(row.original.status)
        return <Badge variant={variant}>{label}</Badge>
      },
    },
    {
      accessorKey: 'services',
      id: COLUMN_IDS.services,
      header: 'Servicios',
      enableSorting: false,
      filterFn: servicesFilter,
      meta: { hideOnNarrow: true },
      cell: ({ row }) => {
        const services = row.original.services
        const shown = services.slice(0, MAX_SERVICES)
        const overflow = services.slice(MAX_SERVICES)
        return (
          <div className="flex flex-wrap items-center gap-1">
            {shown.map((service) => (
              <Badge key={service} variant="outline" shape="pill">
                {service}
              </Badge>
            ))}
            {overflow.length > 0 ? (
              <Popover>
                <PopoverTrigger
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Ver ${overflow.length} servicios más`}
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
                  {overflow.map((service) => (
                    <Badge key={service} variant="outline" shape="pill">
                      {service}
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
      id: 'team',
      header: 'Equipo',
      enableSorting: false,
      meta: { hideOnNarrow: true },
      cell: ({ row }) => {
        const members = row.original.assignedTeam
        if (members.length === 0) return <span className="fg-subtle">{NO_REGISTRO}</span>
        const shown = members.slice(0, MAX_TEAM)
        const extra = members.length - shown.length
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                {shown.map((member) => (
                  <Avatar key={member.id} size="sm">
                    {member.avatarUrl ? (
                      <AvatarImage src={member.avatarUrl} alt={member.name} />
                    ) : null}
                    <AvatarFallback>{initials(member.name)}</AvatarFallback>
                  </Avatar>
                ))}
                {extra > 0 ? (
                  <Avatar size="sm">
                    <AvatarFallback>+{extra}</AvatarFallback>
                  </Avatar>
                ) : null}
              </div>
            </TooltipTrigger>
            <TooltipContent>{members.map((member) => member.name).join(', ')}</TooltipContent>
          </Tooltip>
        )
      },
    },
    {
      accessorKey: 'monthlyFee',
      id: 'monthlyFee',
      header: 'Fee mensual',
      meta: { mobile: 'secondary' },
      cell: ({ row }) => (
        <span className="tabular-nums fg-default">
          {formatCurrency(row.original.monthlyFee, row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'paymentStatus',
      id: COLUMN_IDS.paymentStatus,
      header: 'Pago del mes',
      filterFn: equalsFilter,
      cell: ({ row }) => {
        const payment = paymentDisplay(row.original)
        if (!payment) return <span className="fg-subtle">{NO_REGISTRO}</span>
        const { label, variant, detail } = payment
        return (
          <div className="flex flex-col gap-0.5">
            <Badge variant={variant}>{label}</Badge>
            {detail ? <span className="type-caption fg-subtle tabular-nums">{detail}</span> : null}
          </div>
        )
      },
    },
    {
      id: COLUMN_IDS.profitability,
      header: 'Rentabilidad',
      accessorFn: (client) => client.profitabilityPercent ?? -1,
      filterFn: profitabilityFilter,
      cell: ({ row }) => {
        const badge = profitabilityBadge(row.original)
        return badge ? (
          <Badge variant={badge.variant}>{badge.label}</Badge>
        ) : (
          <span className="fg-subtle">{NO_REGISTRO}</span>
        )
      },
    },
    {
      accessorKey: 'lastIncreaseDate',
      id: COLUMN_IDS.lastIncreaseDate,
      header: 'Último aumento',
      filterFn: increaseFilter,
      cell: ({ row }) => {
        const info = increaseInfo(row.original.lastIncreaseDate)
        return <span className={cn('type-body-2', INCREASE_TONE_CLASS[info.tone])}>{info.label}</span>
      },
    },
    {
      accessorKey: 'lastMeetingDate',
      id: COLUMN_IDS.lastMeetingDate,
      header: 'Última reunión',
      filterFn: meetingFilter,
      cell: ({ row }) => {
        const iso = row.original.lastMeetingDate
        return (
          <span className={cn('type-body-2', iso ? 'fg-default' : 'fg-subtle')}>
            {formatRelativeDate(iso)}
          </span>
        )
      },
    },
    {
      id: COLUMN_IDS.monotributo,
      header: 'Factura',
      accessorFn: (client) => client.billingEntity,
      enableSorting: false,
      filterFn: billingEntityFilter,
      cell: ({ row }) => {
        const badge = invoiceBadge(row.original.invoiceStatus)
        return (
          <div className="flex items-center gap-1.5">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            <span className="type-caption fg-subtle">
              {row.original.billingEntity
                ? BILLING_ENTITY_LABEL[row.original.billingEntity]
                : 'Sin asignar'}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'nextAction',
      id: 'nextAction',
      header: 'Próxima acción',
      enableSorting: false,
      cell: ({ row }) => (
        <span className={cn('type-body-2', row.original.nextAction ? 'fg-default' : 'fg-subtle')}>
          {row.original.nextAction ?? NO_ACTION}
        </span>
      ),
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
                className={cn(
                  buttonVariants({ variant: 'transparent', color: 'primary' }),
                  'size-8 shrink-0',
                )}
              >
                <AFFORDANCE.overflow className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => actions.onView(client)}>
                  <ICON.view aria-hidden />
                  Ver detalle
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => actions.onEdit(client)}>
                  <ICON.edit aria-hidden />
                  Editar cliente
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onRegisterPayment(client)}>
                  <ICON.payment aria-hidden />
                  Registrar pago
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onIssueInvoice(client)}>
                  <ICON.invoice aria-hidden />
                  Emitir factura
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onSendStatement(client)}>
                  <ICON.sendStatement aria-hidden />
                  Enviar cuenta corriente
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onAddExtraWork(client)}>
                  <ICON.addExtraWork aria-hidden />
                  Agregar trabajo extra
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => actions.onChurn(client)}>
                  <ICON.churn aria-hidden />
                  Deshabilitar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(client)}>
                  <ICON.delete aria-hidden />
                  Eliminar permanente
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  if (role === 'employee')
    return [
      ...columns.filter((column) => EMPLOYEE_COLUMN_IDS.has(column.id ?? '')),
      employeeCargarColumn(actions),
    ]
  if (!hasCapability(capabilities, 'profitability'))
    return columns.filter((column) => column.id !== COLUMN_IDS.profitability)
  return columns
}
