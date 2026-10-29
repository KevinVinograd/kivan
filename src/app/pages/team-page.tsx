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

export function TeamPage() {
  return <TeamPageContent />
}

function TeamPageContent() {
  const { role, capabilities, canDo } = useRole()
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
  const roleMembers = useMemo(
    () =>
      role === 'employee'
        ? members.filter((member) => selfMemberId !== null && member.id === selfMemberId)
        : members,
    [members, role, selfMemberId],
  )
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'table' | 'split'>('table')
  const belowDesktop = useIsBelowDesktop()
  const [headerRef, regionRef] = useHeaderOffset<HTMLDivElement, HTMLDivElement>()
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<TeamFilters>({})
  const [dialog, setDialog] = useState<TeamDialogState>({ kind: 'none' })
  const [changeStatusTarget, setChangeStatusTarget] = useState<TeamMember[] | null>(null)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

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

  const trail = trailToHere(searchParams, '/team')

  const initialTab = coerceTeamDetailTab(searchParams.get('tab'))

  useEffect(() => {
    const open = searchParams.get('open')
    if (open) setSelectedId(open)
  }, [searchParams])

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

  const inDetail =
    role !== 'employee' && status === 'ready' && hasData && selectedId != null && selected != null

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

  if (role === 'employee') {
    const me = roleMembers[0] ?? null
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
