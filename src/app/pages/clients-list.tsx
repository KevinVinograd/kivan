import { useState, type ReactNode } from 'react'
import { cn } from '@/app/lib/utils'
import { useIsMobile } from '@/app/lib/use-is-mobile'
import { useFlipReorder } from '@/app/lib/use-flip-reorder'
import type { RiskLevel } from './dashboard-types'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Checkbox,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/app/components/components'
import { PanelContent, SectionHeader } from '@/app/components/templates'
import { FilterPopover, Toolbar } from '@/app/components/patterns'
import type { Client } from './clients-mock-data'
import {
  PAYMENT_TONE_FG,
  alertaPrincipal,
  clientMatchesListFilters,
  clientSearchText,
  clientStatusBadge,
  initials,
  paymentDisplay,
  type ClientListFilters,
} from './clients-format'
import { FilterFieldsAccordion } from './clients-filters'
import { ClientsBulkActions } from './clients-bulk-actions'

export type ClientsListProps = {
  clients: Client[]
  selectedId: string | null
  onSelect: (id: string) => void
  breadcrumb?: ReactNode
  filters: ClientListFilters
  onFiltersChange: (filters: ClientListFilters) => void
  riskOf: (client: Client) => RiskLevel | null
  picked: Set<string>
  onTogglePick: (id: string) => void
  onClearPicked: () => void
  onBulkInvoice: (clients: Client[]) => void
  onBulkChangeStatus: (clients: Client[]) => void
  onBulkExport: (clients: Client[]) => void
}

type ListSortField = 'name' | 'profitability' | 'lastMeeting' | 'monthlyFee'
type ListSort = { field: ListSortField; dir: 'asc' | 'desc' }

const SORT_OPTIONS: { field: ListSortField; label: string; defaultDir: 'asc' | 'desc' }[] = [
  { field: 'name', label: 'Nombre', defaultDir: 'asc' },
  { field: 'profitability', label: 'Rentabilidad', defaultDir: 'desc' },
  { field: 'lastMeeting', label: 'Última reunión', defaultDir: 'desc' },
  { field: 'monthlyFee', label: 'Fee mensual', defaultDir: 'desc' },
]

function compareClients(a: Client, b: Client, sort: ListSort): number {
  const dir = sort.dir === 'asc' ? 1 : -1
  switch (sort.field) {
    case 'name':
      return a.name.localeCompare(b.name, 'es') * dir
    case 'profitability':
      return ((a.profitabilityPercent ?? 0) - (b.profitabilityPercent ?? 0)) * dir
    case 'monthlyFee':
      return (a.monthlyFee - b.monthlyFee) * dir
    case 'lastMeeting': {
      const av = a.lastMeetingDate
      const bv = b.lastMeetingDate
      if (!av && !bv) return 0
      if (!av) return 1
      if (!bv) return -1
      return av.localeCompare(bv) * dir
    }
  }
}

function ListSortPopover({
  sort,
  onChange,
}: {
  sort: ListSort | null
  onChange: (sort: ListSort | null) => void
}) {
  const active = sort != null
  function select(field: ListSortField) {
    const option = SORT_OPTIONS.find((item) => item.field === field)
    if (!option) return
    if (sort?.field === field) {
      onChange({ field, dir: sort.dir === 'asc' ? 'desc' : 'asc' })
    } else {
      onChange({ field, dir: option.defaultDir })
    }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton
          aria-label="Ordenar"
          variant="outlined"
          color="primary"
          size="default"
          selected={active}
        >
          <AFFORDANCE.sort className="size-5" aria-hidden />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-56 flex-col gap-1">
        <div className="flex items-center justify-between px-2 pt-2">
          <span className="type-body-2 font-semibold fg-subtle">Ordenar por</span>
          {active ? (
            <Button variant="transparent" color="primary" size="dense" onClick={() => onChange(null)}>
              Restablecer
            </Button>
          ) : null}
        </div>
        {SORT_OPTIONS.map((option) => {
          const isActive = sort?.field === option.field
          return (
            <button
              key={option.field}
              type="button"
              onClick={() => select(option.field)}
              aria-pressed={isActive}
              className={cn(
                'flex items-center justify-between gap-2 rounded-control px-2 py-1.5 text-left type-body-2 motion-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                isActive ? 'bg-alpha-subtle fg-default' : 'fg-default hover:bg-alpha-subtle-hover',
              )}
            >
              <span>{option.label}</span>
              {isActive ? (
                sort.dir === 'asc' ? (
                  <AFFORDANCE.sortAscending className="size-4" aria-hidden />
                ) : (
                  <AFFORDANCE.sortDescending className="size-4" aria-hidden />
                )
              ) : null}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

function ClientsListItem({
  client,
  active,
  picked,
  onSelect,
  onTogglePick,
}: {
  client: Client
  active: boolean
  picked: boolean
  onSelect: (id: string) => void
  onTogglePick: (id: string) => void
}) {
  const status = clientStatusBadge(client.status)
  const payment = paymentDisplay(client)
  const alerta = alertaPrincipal(client)
  return (
    <div
      data-flip-id={client.id}
      data-picked={picked ? 'true' : undefined}
      className={cn(
        'group/item flex items-start gap-3 rounded-control px-3 py-2 motion-standard',
        active ? 'bg-alpha-subtle-active' : 'hover:bg-alpha-subtle-hover',
      )}
    >
      <div className="flex size-6 shrink-0 items-center justify-center">
        <Avatar
          size="sm"
          active={active}
          className="group-hover/item:hidden group-data-[picked=true]/item:hidden"
        >
          <AvatarFallback>{initials(client.name)}</AvatarFallback>
        </Avatar>
        <Checkbox
          checked={picked}
          onCheckedChange={() => onTogglePick(client.id)}
          aria-label={`Seleccionar ${client.name}`}
          className="hidden group-hover/item:block group-data-[picked=true]/item:block"
        />
      </div>
      <button
        type="button"
        onClick={() => onSelect(client.id)}
        aria-current={active ? 'true' : undefined}
        className="flex min-w-0 flex-1 flex-col gap-1 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="type-button fg-default">{client.name}</span>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <div className="flex items-center gap-1 type-caption">
          {payment ? (
            <>
              <span className={PAYMENT_TONE_FG[payment.variant]}>{payment.label}</span>
              {payment.detail ? (
                <span className="fg-subtle tabular-nums">· {payment.detail}</span>
              ) : null}
            </>
          ) : (
            <span className="fg-subtle">Sin cobro este mes</span>
          )}
        </div>
        <div className="type-caption fg-subtle">
          {client.profitabilityPercent != null ? `Rentabilidad ${client.profitabilityPercent}%` : null}
          {client.profitabilityPercent != null && alerta ? ' · ' : null}
          {alerta ? <span className={alerta.tone === 'danger' ? 'fg-danger' : 'fg-subtle'}>{alerta.label}</span> : null}
        </div>
      </button>
    </div>
  )
}

export function ClientsList({
  clients,
  selectedId,
  onSelect,
  breadcrumb,
  filters,
  onFiltersChange,
  riskOf,
  picked,
  onTogglePick,
  onClearPicked,
  onBulkInvoice,
  onBulkChangeStatus,
  onBulkExport,
}: ClientsListProps) {
  const isMobile = useIsMobile()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ListSort | null>(null)
  const normalized = query.trim().toLowerCase()
  const filtered = clients.filter((client) => {
    if (normalized && !clientSearchText(client).includes(normalized)) return false
    return clientMatchesListFilters(client, filters, riskOf(client))
  })
  const sorted = sort ? [...filtered].sort((a, b) => compareClients(a, b, sort)) : filtered
  const listRef = useFlipReorder<HTMLDivElement>(sorted.map((client) => client.id))
  const pickedClients = clients.filter((client) => picked.has(client.id))

  const filterCount = Object.values(filters).filter(Boolean).length
  const filterSort = (
    <>
      <FilterPopover count={filterCount} onClear={() => onFiltersChange({})}>
        <FilterFieldsAccordion
          valueFor={(id) => filters[id]}
          onToggle={(id, value) => onFiltersChange({ ...filters, [id]: value })}
        />
      </FilterPopover>
      <ListSortPopover sort={sort} onChange={setSort} />
    </>
  )
  const searchLabel = 'Buscar clientes'
  const searchPlaceholder = isMobile ? 'Buscar cliente' : 'Buscar por nombre, CUIT o email'

  return (
    <>
      {isMobile ? null : (
        <SectionHeader title="Clientes" breadcrumb={breadcrumb} actions={filterSort} />
      )}
      <PanelContent layout="stacked" flushTop>
        {isMobile ? (
          <Toolbar
            search={{
              value: query,
              onChange: setQuery,
              placeholder: searchPlaceholder,
              label: searchLabel,
            }}
            filters={filterSort}
          />
        ) : (
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
          />
        )}
        <ClientsBulkActions
          clients={pickedClients}
          onInvoice={onBulkInvoice}
          onChangeStatus={onBulkChangeStatus}
          onExport={onBulkExport}
          onClear={onClearPicked}
        />
        <div ref={listRef} className="flex flex-col gap-1">
          {sorted.length > 0 ? (
            sorted.map((client) => (
              <ClientsListItem
                key={client.id}
                client={client}
                active={client.id === selectedId}
                picked={picked.has(client.id)}
                onSelect={onSelect}
                onTogglePick={onTogglePick}
              />
            ))
          ) : (
            <p className="px-3 py-6 text-center type-caption fg-subtle">No encontramos clientes</p>
          )}
        </div>
      </PanelContent>
    </>
  )
}
