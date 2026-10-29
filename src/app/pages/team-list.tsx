import { useState, type ReactNode } from 'react'
import { cn } from '@/app/lib/utils'
import { useIsMobile } from '@/app/lib/use-is-mobile'
import { useFlipReorder } from '@/app/lib/use-flip-reorder'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
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
import { PAYMENT_TONE_FG } from './clients-format'
import type { TeamMember } from './clients-mock-data'
import { useTeamData, type TeamDataContextValue } from './team-data'
import { TeamFilterFieldsAccordion } from './team-filters'
import { TeamBulkActions } from './team-bulk-actions'
import {
  formatCurrency,
  initials,
  loadBadge,
  paymentStatusBadge,
  teamStatusBadge,
  NO_RECORD,
  type TeamFilters,
} from './team-format'

export type TeamListProps = {
  members: TeamMember[]
  selectedId: string | null
  onSelect: (id: string) => void
  breadcrumb?: ReactNode
  picked: Set<string>
  onTogglePick: (id: string) => void
  onClearPicked: () => void
  onBulkGenerateStatements: (members: TeamMember[]) => void
  onBulkChangeStatus: (members: TeamMember[]) => void
  onBulkExport: (members: TeamMember[]) => void
}

type ListSortField = 'name' | 'pay' | 'load' | 'clients'
type ListSort = { field: ListSortField; dir: 'asc' | 'desc' }

const SORT_OPTIONS: { field: ListSortField; label: string; defaultDir: 'asc' | 'desc' }[] = [
  { field: 'name', label: 'Nombre', defaultDir: 'asc' },
  { field: 'pay', label: 'Pago estimado', defaultDir: 'desc' },
  { field: 'load', label: 'Carga', defaultDir: 'desc' },
  { field: 'clients', label: 'Clientes', defaultDir: 'desc' },
]

function compareMembers(
  a: TeamMember,
  b: TeamMember,
  sort: ListSort,
  td: TeamDataContextValue,
): number {
  const dir = sort.dir === 'asc' ? 1 : -1
  switch (sort.field) {
    case 'name':
      return a.name.localeCompare(b.name, 'es') * dir
    case 'pay':
      return (td.estimatedPayForMember(a.id) - td.estimatedPayForMember(b.id)) * dir
    case 'load':
      return (td.loadPercent(a.id) - td.loadPercent(b.id)) * dir
    case 'clients':
      return (td.clientsForMember(a.id).length - td.clientsForMember(b.id).length) * dir
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

function TeamListItem({
  member,
  active,
  picked,
  onSelect,
  onTogglePick,
}: {
  member: TeamMember
  active: boolean
  picked: boolean
  onSelect: (id: string) => void
  onTogglePick: (id: string) => void
}) {
  const td = useTeamData()
  const status = teamStatusBadge(member.status)
  const statement = td.statementForMember(member.id)
  const payment = statement ? paymentStatusBadge(statement.status) : null
  const load = loadBadge(td.loadStatusForMember(member.id))
  const alerta = td.primaryAlert(member)
  return (
    <div
      data-flip-id={member.id}
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
          {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt={member.name} /> : null}
          <AvatarFallback>{initials(member.name)}</AvatarFallback>
        </Avatar>
        <Checkbox
          checked={picked}
          onCheckedChange={() => onTogglePick(member.id)}
          aria-label={`Seleccionar ${member.name}`}
          className="hidden group-hover/item:block group-data-[picked=true]/item:block"
        />
      </div>
      <button
        type="button"
        onClick={() => onSelect(member.id)}
        aria-current={active ? 'true' : undefined}
        className="flex min-w-0 flex-1 flex-col gap-1 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="type-button fg-default">{member.name}</span>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <div className="flex items-center gap-1 type-caption">
          <span className="fg-subtle tabular-nums">
            {statement ? formatCurrency(statement.totalAmount) : NO_RECORD}
          </span>
          {payment ? <span className={PAYMENT_TONE_FG[payment.variant]}>· {payment.label}</span> : null}
        </div>
        <div className="type-caption fg-subtle">
          <span className="tabular-nums">{td.loadHoursLabel(member.id)}</span>
          {' · '}
          {load.label}
          {alerta ? (
            <>
              {' · '}
              <span className={alerta.tone === 'danger' ? 'fg-danger' : 'fg-subtle'}>{alerta.label}</span>
            </>
          ) : null}
        </div>
      </button>
    </div>
  )
}

export function TeamList({
  members,
  selectedId,
  onSelect,
  breadcrumb,
  picked,
  onTogglePick,
  onClearPicked,
  onBulkGenerateStatements,
  onBulkChangeStatus,
  onBulkExport,
}: TeamListProps) {
  const td = useTeamData()
  const isMobile = useIsMobile()
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<TeamFilters>({})
  const [sort, setSort] = useState<ListSort | null>(null)
  const normalized = query.trim().toLowerCase()
  const filtered = members.filter((member) => {
    if (normalized && !td.teamSearchText(member).includes(normalized)) return false
    return td.teamMatchesFilters(member, filters)
  })
  const sorted = sort ? [...filtered].sort((a, b) => compareMembers(a, b, sort, td)) : filtered
  const listRef = useFlipReorder<HTMLDivElement>(sorted.map((member) => member.id))
  const pickedMembers = members.filter((member) => picked.has(member.id))

  const filterCount = Object.values(filters).filter(Boolean).length
  const filterSort = (
    <>
      <FilterPopover count={filterCount} onClear={() => setFilters({})}>
        <TeamFilterFieldsAccordion
          valueFor={(id) => filters[id]}
          onToggle={(id, value) => setFilters({ ...filters, [id]: value })}
        />
      </FilterPopover>
      <ListSortPopover sort={sort} onChange={setSort} />
    </>
  )
  const searchLabel = 'Buscar personas'
  const searchPlaceholder = isMobile ? 'Buscar persona' : 'Buscar por nombre, rol o cliente'

  return (
    <>
      {isMobile ? null : (
        <SectionHeader title="Equipo" breadcrumb={breadcrumb} actions={filterSort} />
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
        <TeamBulkActions
          members={pickedMembers}
          onGenerateStatements={onBulkGenerateStatements}
          onChangeStatus={onBulkChangeStatus}
          onExport={onBulkExport}
          onClear={onClearPicked}
        />
        <div ref={listRef} className="flex flex-col gap-1">
          {sorted.length > 0 ? (
            sorted.map((member) => (
              <TeamListItem
                key={member.id}
                member={member}
                active={member.id === selectedId}
                picked={picked.has(member.id)}
                onSelect={onSelect}
                onTogglePick={onTogglePick}
              />
            ))
          ) : (
            <p className="px-3 py-6 text-center type-caption fg-subtle">No encontramos personas</p>
          )}
        </div>
      </PanelContent>
    </>
  )
}
