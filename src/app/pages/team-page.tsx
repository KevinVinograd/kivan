import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { RowSelectionState } from '@tanstack/react-table'

import { PageHeader, PageContent, MasterDetailLayout, PanelGroup, Panel } from '@/app/components/templates'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  TooltipProvider,
  toast,
} from '@/app/components/components'
import { DataTable } from '@/app/components/patterns'
import { ICON, AFFORDANCE } from '@/app/lib/icon-registry'
import { cn } from '@/app/lib/utils'
import { motionClass } from '@/app/lib/motion'
import { trailToHere } from '@/app/lib/nav-trail'
import { useIsBelowDesktop } from '@/app/lib/use-is-mobile'
import { useHeaderOffset } from '@/app/lib/use-header-offset'
import { useQuery } from '@tanstack/react-query'

import { usersApi } from '@/api/users'
import { queryKeys } from '@/queries/keys'
import { useRole } from '@/app/lib/use-role'
import { useAuth } from '@/app/lib/auth-store'
import { perspectiveForRole } from '@/app/lib/role-access'
import type { TeamMember } from './clients-mock-data'
import { useRevalidateTeamOnOpen, useTeamData } from './team-data'
import { teamColumns, type TeamRowActions } from './team-columns'
import { type TeamFilters } from './team-format'
import { TeamToolbar } from './team-toolbar'
import { TeamSummaryKpis } from './team-summary-kpis'
import { TeamList } from './team-list'
import { TeamDetail, coerceTeamDetailTab } from './team-detail'
import { TeamDialogs, type TeamDialogState } from './team-dialogs'
import { TeamChangeStatusDialog } from './team-bulk-dialogs'
import {
  exportTeamCsv,
  exportTeamStatementsCsv,
  type TeamExportRow,
  type TeamStatementExportRow,
} from './team-export'
import { TeamEmptyFiltered, TeamEmptyGeneral, TeamError, TeamLoading } from './team-states'

type LoadStatus = 'loading' | 'ready' | 'error'

/**
 * Team module (PRD). The shared `TeamDataProvider` is mounted once at the router
 * root (above Clients + Team), so the roster, activity entries, assignments and
 * payment status are one mutable source of truth: logging hours/viáticos/extras,
 * editing or adding people, assigning members and approving payments all recompute
 * carga, pago estimado and the statuses live across both modules. The vista tabla
 * (toolbar + DataTable) switches to a master-detail list + detail on row open.
 */
export function TeamPage() {
  return <TeamPageContent />
}

function TeamPageContent() {
  const { role, capabilities, canDo } = useRole()
  // Which roster people already hold a login. Offering "Invitar" to someone who has one
  // would just 409 at the API (`User.teamMemberId` is unique), so the offer is only made
  // where it can succeed. Its own query: a failure here must not take the page down — it
  // simply hides the offer, and Configuración remains the way in.
  const canInvite = role === 'owner' || role === 'admin'
  const linkedUsers = useQuery({
    queryKey: queryKeys.users.all,
    queryFn: usersApi.list,
    enabled: canInvite,
    staleTime: 60_000,
  })
  const linkedMemberIds = new Set(
    (linkedUsers.data ?? []).map((u) => u.teamMemberId).filter((id): id is string => Boolean(id)),
  )
  const { me } = useAuth()
  const selfMemberId = me?.teamMemberId ?? null
  const td = useTeamData()
  useRevalidateTeamOnOpen()
  const members = td.members
  // The employee perspective is their own profile only; owner/admin see the full
  // roster. Anchored to the signed-in employee's `teamMemberId`; an unlinked login
  // sees no rows (fails closed) rather than the whole roster.
  const roleMembers = useMemo(
    () =>
      role === 'employee'
        ? members.filter((member) => selfMemberId !== null && member.id === selfMemberId)
        : members,
    [members, role, selfMemberId],
  )
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Effective master-detail mode reported by MasterDetailLayout. It trails the
  // panel exit (stays 'split' until the split actually collapses), so the
  // PageHeader fades back in lockstep with the exit instead of mid-exit.
  const [mode, setMode] = useState<'table' | 'split'>('table')
  // Below desktop the detail opens in a covering bottom Sheet, so the header must
  // NOT dissolve behind it — it stays put as the Sheet's page context.
  const belowDesktop = useIsBelowDesktop()
  // While the split is open the content layer fills the whole region over the
  // faded header, so the table dissolving out is offset back down by the header
  // height (published as `--md-table-offset`, consumed by the table slot) to stay
  // anchored — no lurch as it fades. The list/detail still fill from the top.
  const [headerRef, regionRef] = useHeaderOffset<HTMLDivElement, HTMLDivElement>()
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<TeamFilters>({})
  const [dialog, setDialog] = useState<TeamDialogState>({ kind: 'none' })
  // The bulk "Cambiar estado" dialog target (the selected members); null when closed.
  const [changeStatusTarget, setChangeStatusTarget] = useState<TeamMember[] | null>(null)
  // Single selection source of truth (keyed by member id) shared by the table
  // and the master-detail list, so picks persist across the view switch.
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  // The load status comes from the roster fetch this page reads, not from a timer. It used
  // to be `setTimeout(() => setStatus('ready'), 500)`, which flipped to ready whether the
  // fetch had succeeded, was still in flight, or had failed — so `TeamError` was unreachable
  // and a failed `GET /team-members` rendered the "no members yet" empty state instead.
  // isLoading BEFORE isError: the store keeps isError true through a `refetch`, so testing
  // the error first would freeze the error screen and the retry would look inert.
  const status: LoadStatus = td.isLoading ? 'loading' : td.isError ? 'error' : 'ready'

  const pickedIds = useMemo(
    () => new Set(Object.keys(rowSelection).filter((id) => rowSelection[id])),
    [rowSelection],
  )

  function togglePick(id: string) {
    setRowSelection((prev) => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else next[id] = true
      return next
    })
  }

  function clearPicked() {
    setRowSelection({})
  }

  // ── Bulk actions (header operates on the filtered set; the selection bar on the
  // picked members). All synchronous local-state, so no loading/error path
  // (feedback Section 5); each confirms with a success toast (Section 4).
  const exportTeam = useCallback(
    (list: TeamMember[]) => {
      if (list.length === 0) {
        toast.warning('No hay personas para exportar')
        return
      }
      const rows: TeamExportRow[] = list.map((member) => {
        const statement = td.statementForMember(member.id)
        return { member, estimatedPay: statement?.totalAmount, paymentStatus: statement?.status ?? '' }
      })
      exportTeamCsv(rows)
      toast.success('Exportación generada')
    },
    [td],
  )

  const generateCuentas = useCallback(
    (list: TeamMember[]) => {
      if (list.length === 0) {
        toast.warning('No hay personas para generar cuentas')
        return
      }
      const rows: TeamStatementExportRow[] = list.map((member) => ({
        memberName: member.name,
        statement: td.statementForMember(member.id),
      }))
      exportTeamStatementsCsv(rows)
      toast.success('Cuentas corrientes generadas')
    },
    [td],
  )

  const changeStatus = useCallback((list: TeamMember[]) => {
    if (list.length === 0) return
    setChangeStatusTarget(list)
  }, [])

  // Contextual back-trail accumulated in the URL (`?trail=`): every step the user
  // passed through to deep-link into a member here, so they can step back to any of
  // them. `trailToHere` collapses a loop back to this page so it never duplicates
  // the leaf and a round trip does not leave a misleading parent chain.
  const trail = trailToHere(searchParams, '/team')

  // Initial TeamDetail tab from a `?tab=` deep-link (the employee-dashboard CTAs
  // land on the relevant panel, e.g. Carga). Unknown/absent values coerce to
  // undefined and TeamDetail falls back to its default Resumen tab.
  const initialTab = coerceTeamDetailTab(searchParams.get('tab'))

  // Open a member's detail when deep-linked with ?open=<id> (e.g. from the
  // Employee Dashboard activity feed). The `?trail=` param stays in the URL so the
  // accumulated back-breadcrumb persists.
  useEffect(() => {
    const open = searchParams.get('open')
    if (open) setSelectedId(open)
  }, [searchParams])

  // Open the new-member dialog when arriving from the global "Nuevo" launcher
  // (?new=1), then strip the param so it fires once. Owner/admin only — the
  // employee uses disjoint ?new=<token> work-log tokens (effect below).
  useEffect(() => {
    if (role === 'employee') return
    if (!searchParams.has('new')) return
    setDialog({ kind: 'new' })
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('new')
        return next
      },
      { replace: true },
    )
  }, [role, searchParams, setSearchParams])

  // Employee "Nuevo" self-creates: a disjoint ?new=<token> set deep-links to the
  // matching self work-log dialog for the signed-in member, then strips the param.
  useEffect(() => {
    if (role !== 'employee') return
    const token = searchParams.get('new')
    const KINDS: Record<string, TeamDialogState['kind']> = {
      hours: 'hours',
      production: 'production',
      expense: 'expense',
      extra: 'extra',
    }
    const kind = token ? KINDS[token] : undefined
    const me = roleMembers[0]
    if (!kind || !me) return
    setDialog({ kind, member: me } as TeamDialogState)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('new')
        return next
      },
      { replace: true },
    )
  }, [role, searchParams, setSearchParams, roleMembers])

  const selected = selectedId ? td.memberById(selectedId) ?? null : null

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return roleMembers.filter((member) => {
      if (normalized && !td.teamSearchText(member).includes(normalized)) return false
      return td.teamMatchesFilters(member, filters)
    })
  }, [roleMembers, query, filters, td])

  const rowActions = useMemo<TeamRowActions>(
    () => ({
      onView: (member) => setSelectedId(member.id),
      onEdit: (member) => setDialog({ kind: 'edit', member }),
      onLogHours: (member) => setDialog({ kind: 'hours', member }),
      onAddProduction: (member) => setDialog({ kind: 'production', member }),
      onAddExpense: (member) => setDialog({ kind: 'expense', member }),
      onAddExtra: (member) => setDialog({ kind: 'extra', member }),
      onApprovePayment: (member) => setDialog({ kind: 'approve', member }),
      onPayDifference: (member) => setDialog({ kind: 'pay', member }),
      onConfirmPaid: (member) => setDialog({ kind: 'confirmPaid', member }),
      onDeactivate: (member) => setDialog({ kind: 'deactivate', member }),
    }),
    [],
  )

  const columns = useMemo(
    () => teamColumns(rowActions, td, role, capabilities),
    [rowActions, td, role, capabilities],
  )

  function retry() {
    td.refetch()
  }

  const hasData = roleMembers.length > 0
  const tableContent =
    status === 'loading' ? (
      <TeamLoading />
    ) : status === 'error' ? (
      <TeamError onRetry={retry} />
    ) : !hasData ? (
      <TeamEmptyGeneral onNewMember={() => setDialog({ kind: 'new' })} />
    ) : (
      <div className="flex flex-col gap-4 md:gap-6">
        {/* Roster summary row above the toolbar (owner/admin table view only —
            the employee perspective renders its own profile, not this row).
            The gap between the KPI row and the toolbar is the page's card rhythm:
            16px on a phone, 24px from `md`. */}
        <TeamSummaryKpis members={members} td={td} />
        <DataTable
        columns={columns}
        data={filtered}
        pageSize={48}
        initialColumnVisibility={{ lastUpdated: false, extras: false, expenses: false }}
        getRowId={(member) => member.id}
        pinActionsColumn
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        onRowClick={role === 'employee' ? undefined : (member) => setSelectedId(member.id)}
        toolbar={(table) => (
          <TeamToolbar
            table={table}
            query={query}
            onQueryChange={setQuery}
            filters={filters}
            onFiltersChange={setFilters}
            onBulkGenerateStatements={generateCuentas}
            onBulkChangeStatus={changeStatus}
            onBulkExport={exportTeam}
          />
        )}
        emptyState={() => (
          <TeamEmptyFiltered
            onClearFilters={() => {
              setQuery('')
              setFilters({})
            }}
          />
        )}
        />
      </div>
    )

  // The employee perspective renders its own self-profile directly (below), so it
  // never enters the owner/admin master-detail view even via an ?open= deep-link.
  const inDetail =
    role !== 'employee' && status === 'ready' && hasData && selectedId != null && selected != null

  // Renders in the PageHeader overline (table view) and the list panel's
  // SectionHeader (detail view, where the PageHeader is hidden).
  const breadcrumbNode = trail.length > 0 ? (
    <Breadcrumb>
      <BreadcrumbList>
        {trail.map((crumb, index) => (
          <Fragment key={`${crumb.to}-${index}`}>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={crumb.to}>{crumb.label}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>Equipo</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  ) : null

  // Employee perspective: a member only ever sees themselves, so render their own
  // profile directly in the `self` perspective — the four self work-tracking
  // actions (Cargar horas/producción/viático/extra) reuse the same dialogs and
  // mutations as owner/admin; manager actions stay absent.
  if (role === 'employee') {
    const me = roleMembers[0] ?? null
    // No PageHeader here: TeamDetail's own hero (avatar + name + role) already
    // heads this self-profile view, so a "Mi trabajo" page title would only
    // repeat it.
    return (
      <TooltipProvider>
        <PageContent>
          {status === 'loading' ? (
            <TeamLoading />
          ) : status === 'error' ? (
            <TeamError onRetry={retry} />
          ) : me ? (
            <PanelGroup layout="inline" fill>
              <Panel type="medium">
                <TeamDetail
                  member={me}
                  perspective={perspectiveForRole(role)}
                  initialTab={initialTab}
                  onClose={() => {}}
                  onEdit={() => {}}
                  onLogHours={(member) => setDialog({ kind: 'hours', member })}
                  onAddProduction={(member) => setDialog({ kind: 'production', member })}
                  onAddExpense={(member) => setDialog({ kind: 'expense', member })}
                  onAddExtra={(member) => setDialog({ kind: 'extra', member })}
                  onApprovePayment={() => {}}
                  onApproveExtras={() => {}}
                  onPayDifference={() => {}}
                  onConfirmPaid={() => {}}
                  onAssignToClient={() => {}}
                  onDeactivate={() => {}}
                />
              </Panel>
            </PanelGroup>
          ) : (
            <span className="px-4 md:px-6 lg:px-8 desktop:px-10 type-body-2 fg-subtle">No hay datos de tu perfil este mes.</span>
          )}
        </PageContent>
        <TeamDialogs state={dialog} onClose={() => setDialog({ kind: 'none' })} />
      </TooltipProvider>
    )
  }

  // Desktop-only: while the master-detail split is open the PageHeader dissolves
  // IN PLACE (blur + fade + scale-recede) and no longer collapses its height, so
  // nothing below it reflows — just a fade, nothing moves. The content region
  // then extends up to fill the whole area over the covered header band, so the
  // split still reaches full height with no empty gap. Below desktop the detail
  // opens in a bottom Sheet, so the header stays put (never dissolves) there.
  //
  // Two flags: `dissolved` (LAYOUT) trails the exit via `mode` so the content
  // layer stays lifted until the split finishes collapsing. `headerDissolved`
  // (the VISUAL fade) instead drops the moment the selection clears, so the
  // header's dissolve-IN starts at close and — with the `content-dissolve` delay
  // tuned to `md-content-in` — fades the header back in IN LOCKSTEP with the
  // returning table rather than trailing it.
  const dissolved = (inDetail || mode === 'split') && !belowDesktop
  const headerDissolved = inDetail && !belowDesktop

  return (
    <TooltipProvider>
      <div ref={regionRef} className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={headerRef}
          className={cn(motionClass('content-dissolve'), dissolved && 'pointer-events-none')}
          data-dissolved={headerDissolved ? 'true' : undefined}
          inert={dissolved ? '' : undefined}
        >
          <PageHeader
            eyebrow="Hold"
            eyebrowHidden
            breadcrumb={breadcrumbNode ?? undefined}
            title="Equipo"
            description="Gestioná carga de trabajo, pagos, asignaciones y productividad del equipo."
            // Header bulk actions operate on the current filtered set. On mobile
            // export + generar cuentas collapse into the overflow menu and
            // "Agregar persona" stays as the primary (plus) action.
            actions={[
              {
                key: 'export',
                label: 'Exportar',
                icon: AFFORDANCE.download,
                variant: 'outlined',
                iconOnly: true,
                onClick: () => exportTeam(filtered),
              },
              {
                key: 'statements',
                label: 'Generar cuentas',
                icon: ICON.statement,
                variant: 'outlined',
                iconOnly: true,
                onClick: () => generateCuentas(filtered),
              },
              ...(canDo('member.create')
                ? [
                    {
                      key: 'new',
                      label: 'Agregar persona',
                      icon: AFFORDANCE.create,
                      variant: 'solid' as const,
                      leadingIcon: true,
                      mobileIconOnly: true,
                      primary: true,
                      onClick: () => setDialog({ kind: 'new' }),
                    },
                  ]
                : []),
            ]}
          />
        </div>
        <div className={cn('flex min-h-0 flex-col', dissolved ? 'absolute inset-0' : 'flex-1')}>
          <PageContent>
            <MasterDetailLayout
              selectedId={inDetail ? selectedId : null}
              detailType="medium"
              onModeChange={setMode}
              onCloseDetail={() => setSelectedId(null)}
              detailTitle="Detalle del integrante"
              table={
                <div className={cn('px-4 md:px-6 lg:px-8 desktop:px-10', dissolved && 'pt-[var(--md-table-offset)]')}>
                  {tableContent}
                </div>
              }
              list={
                // Gated on `status` exactly like `tableContent` above. Without this
                // the list branch renders straight from `roleMembers`, which is []
                // on a failed fetch, so below `md` (where MasterDetailLayout shows
                // the list, not the table) a 500 read as "No encontramos personas":
                // the roster reported itself empty when it had simply never loaded.
                status === 'loading' ? (
                  <TeamLoading />
                ) : status === 'error' ? (
                  <TeamError onRetry={retry} />
                ) : (
                <TeamList
                  members={roleMembers}
                  selectedId={selectedId}
                  onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
                  breadcrumb={breadcrumbNode}
                  picked={pickedIds}
                  onTogglePick={togglePick}
                  onClearPicked={clearPicked}
                  onBulkGenerateStatements={generateCuentas}
                  onBulkChangeStatus={changeStatus}
                  onBulkExport={exportTeam}
                />
                )
              }
              detail={
                <TeamDetail
                  member={selected}
                  initialTab={initialTab}
                  onClose={() => setSelectedId(null)}
                  onEdit={(member) => setDialog({ kind: 'edit', member })}
                  {...(canInvite && selected && !linkedMemberIds.has(selected.id)
                    ? { onInvite: (member: TeamMember) => setDialog({ kind: 'invite', member }) }
                    : {})}
                  onLogHours={(member) => setDialog({ kind: 'hours', member })}
                  onAddProduction={(member) => setDialog({ kind: 'production', member })}
                  onAddExpense={(member) => setDialog({ kind: 'expense', member })}
                  onAddExtra={(member) => setDialog({ kind: 'extra', member })}
                  onApprovePayment={(member) => setDialog({ kind: 'approve', member })}
                  onApproveExtras={(member) => setDialog({ kind: 'approve-extras', member })}
                  onPayDifference={(member) => setDialog({ kind: 'pay', member })}
                  onConfirmPaid={(member) => setDialog({ kind: 'confirmPaid', member })}
                  onAssignToClient={(member) => setDialog({ kind: 'assignClient', member })}
                  onDeactivate={(member) => setDialog({ kind: 'deactivate', member })}
                />
              }
            />
          </PageContent>
        </div>
      </div>
      <TeamDialogs state={dialog} onClose={() => setDialog({ kind: 'none' })} />
      {changeStatusTarget ? (
        <TeamChangeStatusDialog
          members={changeStatusTarget}
          onClose={() => setChangeStatusTarget(null)}
        />
      ) : null}
    </TooltipProvider>
  )
}
