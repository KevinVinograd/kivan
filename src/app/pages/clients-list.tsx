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

/** Compact navigation list shown in the left panel while a record is open (§8). */
export type ClientsListProps = {
  clients: Client[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Contextual breadcrumb shown above the panel title (deep-link from dashboard). */
  breadcrumb?: ReactNode
  /** List filter state, owned by the page so a deep-link can seed it (e.g. risk). */
  filters: ClientListFilters
  onFiltersChange: (filters: ClientListFilters) => void
  /** Resolves a client's derived risk band, for the `risk` list filter. `null` when the
   *  band is unknown — such a client matches no risk filter rather than passing as healthy. */
  riskOf: (client: Client) => RiskLevel | null
  /** Shared multi-select (client ids), owned by the page so it stays in sync with the table. */
  picked: Set<string>
  onTogglePick: (id: string) => void
  onClearPicked: () => void
  onBulkInvoice: (clients: Client[]) => void
  onBulkChangeStatus: (clients: Client[]) => void
  onBulkExport: (clients: Client[]) => void
}

/** List-panel sort (local to the navigation list; the table owns its own sort). */
type ListSortField = 'name' | 'profitability' | 'lastMeeting' | 'monthlyFee'
type ListSort = { field: ListSortField; dir: 'asc' | 'desc' }

const SORT_OPTIONS: { field: ListSortField; label: string; defaultDir: 'asc' | 'desc' }[] = [
  { field: 'name', label: 'Nombre', defaultDir: 'asc' },
  { field: 'profitability', label: 'Rentabilidad', defaultDir: 'desc' },
  { field: 'lastMeeting', label: 'Última reunión', defaultDir: 'desc' },
  { field: 'monthlyFee', label: 'Fee mensual', defaultDir: 'desc' },
]

/** Comparator for the list sort. Missing values sort last regardless of direction. */
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

/** Icon-triggered sort popover for the list panel; the second list toolbar action. */
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
      {/* Leading slot: avatar by default, checkbox on hover or when picked (mirrors the table). */}
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
  // Slide rows from old to new position when the sort changes (reorder-FLIP), so a
  // record the operator is reading visibly travels to its new slot instead of
  // teleporting. Reduced-motion is honored inside the hook (instant jump).
  const listRef = useFlipReorder<HTMLDivElement>(sorted.map((client) => client.id))
  const pickedClients = clients.filter((client) => picked.has(client.id))

  // Filter + sort: section-header actions on desktop, trailing controls beside
  // the search on mobile (where the section header is dropped as redundant).
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
  // The long placeholder names every field the search covers — right on a wide row, and
  // impossible on a 390px one: beside the filter and sort controls the field has ~260px and
  // the text is cut mid-word. A phone gets the short form; the full one returns from `md` up,
  // where it fits. The accessible name stays the same at every width.
  const searchPlaceholder = isMobile ? 'Buscar cliente' : 'Buscar por nombre, CUIT o email'

  return (
    <>
      {/* On mobile the page-level PageHeader already supplies the "Clientes"
          title, so the redundant section header is dropped and its filter/sort
          controls move inline beside the search (below). On md+ the section
          header hosts them. */}
      {isMobile ? null : (
        <SectionHeader title="Clientes" breadcrumb={breadcrumb} actions={filterSort} />
      )}
      <PanelContent layout="stacked" flushTop>
        {isMobile ? (
          // Toolbar owns the row: search + filter + sort on ONE line at every phone width.
          // This list used to hand-roll it — a `flex flex-wrap` container around a search that
          // resolved to `w-full shrink-0` (Input's own base is already `w-full min-w-0`, so the
          // `shrink-0` was all it took) — which is the exact shape Toolbar exists to prevent,
          // and it pushed filter and sort onto a second row on every phone. The rule filed both
          // master lists as deliberate non-adopters; they were not, they were un-migrated, and
          // the adoption check could not see them because they never wrote the `sm:w-72` token
          // it looks for.
          // The `md`+ relocation into the SectionHeader is a LAYOUT decision and stays here —
          // Toolbar owns one row, not where the controls live.
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
