import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { ColumnFiltersState, FilterFn, RowSelectionState } from '@tanstack/react-table'

import { PageHeader, PageContent, MasterDetailLayout } from '@/app/components/templates'
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
import { AFFORDANCE } from '@/app/lib/icon-registry'
import { cn } from '@/app/lib/utils'
import { motionClass } from '@/app/lib/motion'
import { trailToHere } from '@/app/lib/nav-trail'
import { useIsBelowDesktop } from '@/app/lib/use-is-mobile'
import { useHeaderOffset } from '@/app/lib/use-header-offset'
import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { useAuth } from '@/app/lib/auth-store'
import { type Client, type ClientStatus } from './clients-mock-data'
import { type Receivable } from './cobros-mock-data'
import { useReceivables } from './receivables-data'
import { clientMonth, collectable, invoiceable, withMonth } from './clients-receivables'
import { useInvoiceEmitters } from './emitters-api-data'
import { bulkInvoicePlan, type BulkInvoicePlan } from './clients-invoice-plan'
import { type RealEmitter } from './emitters-api-data'
import {
  BulkInvoicePlanDialog,
  ClientMoneyDialogs,
  useMoneyDialog,
} from './clients-receivable-dialogs'
import { clientSearchText, type ClientListFilters } from './clients-format'
import { clientRiskMap, monthIdToPeriod } from './dashboard-data'
import { useReportsCapacity, useReportsProfitability } from './reports-api-data'
import { defaultMonthId } from './monthly-operation-mock-data'
import type { RiskLevel } from './dashboard-types'
import { contactDraft, whatsappLink } from './clients-contact'
import {
  applyFormToClient,
  fetchClients,
  createClientViaApi,
  updateClientViaApi,
  setClientStatusViaApi,
  deleteClientViaApi,
} from './clients-api-data'
import { clientColumns, type ClientRowActions } from './clients-columns'
import { ClientsToolbar } from './clients-toolbar'
import { ClientsSummaryKpis } from './clients-summary-kpis'
import { ClientsList } from './clients-list'
import { exportClientsCsv } from './clients-export'
import { ClientDetail } from './clients-detail'
import { ClientTeamDialogs, type ClientTeamDialogState } from './clients-team-dialogs'
import { ClientsDialogs, type ClientDialogState, type ClientFormValues } from './clients-dialogs'
import { ClientsChangeStatusDialog, ClientSendStatementDialog } from './clients-action-dialogs'
import {
  ClientsEmptyFiltered,
  ClientsEmptyGeneral,
  ClientsEmptyNoAssignments,
  ClientsError,
  ClientsLoading,
} from './clients-states'

type LoadStatus = 'loading' | 'ready' | 'error'

const globalFilterFn: FilterFn<Client> = (row, _columnId, value) =>
  clientSearchText(row.original).includes(String(value).toLowerCase())

function toColumnFilters(filters: ClientListFilters): ColumnFiltersState {
  return Object.entries(filters)
    .filter(([, value]) => value != null && value !== '')
    .map(([id, value]) => ({ id, value }))
}

function fromColumnFilters(columnFilters: ColumnFiltersState): ClientListFilters {
  return Object.fromEntries(columnFilters.map((f) => [f.id, f.value as string])) as ClientListFilters
}

export function ClientsPage() {
  const { role, capabilities, canDo } = useRole()
  const { me } = useAuth()
  const selfMemberId = me?.teamMemberId ?? null
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [data, setData] = useState<Client[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'table' | 'split'>('table')
  const belowDesktop = useIsBelowDesktop()
  const [headerRef, regionRef] = useHeaderOffset<HTMLDivElement, HTMLDivElement>()
  const [dialog, setDialog] = useState<ClientDialogState>({ kind: 'none' })
  const [changeStatusTarget, setChangeStatusTarget] = useState<Client[] | null>(null)
  const [sendStatementTarget, setSendStatementTarget] = useState<Client | null>(null)
  const [clientTeamDialog, setClientTeamDialog] = useState<ClientTeamDialogState>({ kind: 'none' })
  const [listFilters, setListFilters] = useState<ClientListFilters>({})

  const riskPeriod = monthIdToPeriod(defaultMonthId())
  const canScoreRisk = hasCapability(capabilities, 'profitability')
  const riskProfitability = useReportsProfitability(riskPeriod, canScoreRisk)
  const riskCapacity = useReportsCapacity(canScoreRisk)
  const riskFailed = riskProfitability.isError || riskCapacity.isError
  const riskMap = useMemo(
    () =>
      riskFailed
        ? new Map<string, RiskLevel>()
        : clientRiskMap(defaultMonthId(), {
            profitability: riskProfitability.data,
            capacity: riskCapacity.data,
          }),
    [riskFailed, riskProfitability.data, riskCapacity.data],
  )
  const riskOf = useCallback(
    (client: Client): RiskLevel | null => riskMap.get(client.id) ?? null,
    [riskMap],
  )
  const trail = trailToHere(searchParams, '/clients')

  useEffect(() => {
    const open = searchParams.get('open')
    const risk = searchParams.get('risk')
    if (open) setSelectedId(open)
    if (risk) setListFilters((prev) => ({ ...prev, risk }))
  }, [searchParams])

  useEffect(() => {
    if (!searchParams.has('new')) return
    if (role === 'employee') return
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
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

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

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    fetchClients()
      .then((rows) => {
        if (cancelled) return
        setData(rows)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  function refreshClients() {
    fetchClients()
      .then(setData)
      .catch(() => undefined)
  }

  const navigate = useNavigate()

  const {
    receivables,
    collectReceivable,
    generateInvoice,
    updateReceivable,
    isError: receivablesFailed,
  } = useReceivables()

  const { emitters, isError: emittersFailed, refetch: refetchEmitters } = useInvoiceEmitters()
  const [moneyDialog, setMoneyDialog] = useMoneyDialog()
  const [bulkInvoiceState, setBulkInvoiceState] = useState<BulkInvoicePlan | null>(null)
  const [bulkInvoicePending, setBulkInvoicePending] = useState(false)
  const { refetch: refetchReceivables } = useReceivables()

  const marginByClient = useMemo(
    () =>
      riskFailed
        ? new Map<string, number>()
        : new Map(riskProfitability.data.map((row) => [row.clientId, row.margen])),
    [riskFailed, riskProfitability.data],
  )
  const clients = useMemo(
    () =>
      data.map((client) => {
        const withMonthly = withMonth(client, clientMonth(receivables, client.id))
        const margin = marginByClient.get(client.id)
        return margin != null ? { ...withMonthly, profitabilityPercent: margin } : withMonthly
      }),
    [data, receivables, marginByClient],
  )

  const selected = clients.find((client) => client.id === selectedId) ?? null

  const openMoney = useCallback(
    (
      client: Client,
      kind: 'collect' | 'invoice' | 'extra',
      eligible: (rows: Receivable[]) => Receivable[],
      action: string,
    ) => {
      const rows = eligible(clientMonth(receivables, client.id)?.receivables ?? [])
      if (rows.length === 0) {
        setMoneyDialog({ kind: 'noReceivable', client, action })
        return
      }
      if (rows.length === 1) {
        setMoneyDialog({ kind, client, receivable: rows[0] })
        return
      }
      const pick = kind === 'collect' ? 'pickCollect' : kind === 'invoice' ? 'pickInvoice' : 'pickExtra'
      setMoneyDialog({ kind: pick, client, receivables: rows })
    },
    [receivables, setMoneyDialog],
  )

  const exportClients = useCallback(
    (list: Client[]) => {
      if (list.length === 0) {
        toast.warning('No hay clientes para exportar')
        return
      }
      exportClientsCsv(list, { includeProfitability: hasCapability(capabilities, 'profitability') })
      toast.success(
        list.length === 1 ? '1 cliente exportado' : `${list.length} clientes exportados`,
      )
    },
    [role],
  )

  const bulkInvoice = useCallback(
    (list: Client[]) => {
      const plan = bulkInvoicePlan(list, receivables, emitters)
      if (plan.issuable.length === 0 && plan.blocked.length === 0) {
        toast.warning('No hay facturas para generar')
        return
      }
      setBulkInvoiceState(plan)
    },
    [receivables, emitters],
  )

  async function runBulkInvoice(plan: BulkInvoicePlan) {
    setBulkInvoicePending(true)
    const results = await Promise.allSettled(
      plan.issuable.map(({ receivable, emitter }) => generateInvoice(receivable.id, emitter.id)),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    setBulkInvoicePending(false)
    if (ok === 0) {
      toast.error('No se pudo generar ninguna factura')
      return
    }
    setBulkInvoiceState(null)
    if (ok < plan.issuable.length) {
      toast.warning(`Se generaron ${ok} de ${plan.issuable.length} facturas`)
      return
    }
    toast.success(ok === 1 ? '1 factura generada' : `${ok} facturas generadas`)
  }

  async function applyStatus(list: Client[], status: ClientStatus) {
    const results = await Promise.allSettled(
      list.map((client) => setClientStatusViaApi(client.id, status)),
    )
    const saved = new Set(
      list.filter((_, index) => results[index].status === 'fulfilled').map((client) => client.id),
    )

    if (saved.size === 0) {
      toast.error('No se pudo actualizar el estado')
      return
    }

    const now = new Date().toISOString()
    setData((prev) =>
      prev.map((item) => (saved.has(item.id) ? { ...item, status, updatedAt: now } : item)),
    )

    if (saved.size < list.length) {
      toast.warning(`Se actualizaron ${saved.size} de ${list.length} clientes`)
    } else {
      toast.success('Estado actualizado')
    }
    setChangeStatusTarget(null)
  }

  async function issueInvoice(receivable: Receivable, emitter: RealEmitter) {
    try {
      await generateInvoice(receivable.id, emitter.id)
    } catch {
      toast.error('No se pudo generar la factura')
      return
    }
    toast.success('Factura generada')
    setMoneyDialog({ kind: 'none' })
  }

  async function addExtraWork(
    receivable: Receivable,
    input: { description: string; amount: number },
  ) {
    try {
      await updateReceivable(receivable.id, {
        extras: [
          ...receivable.extras.map((extra) => ({
            description: extra.description,
            amount: extra.amount,
            billable: extra.billable,
          })),
          { description: input.description, amount: input.amount, billable: true },
        ],
      })
    } catch {
      toast.error('No se pudo agregar el trabajo extra')
      return
    }
    toast.success('Trabajo extra agregado')
    setMoneyDialog({ kind: 'none' })
  }

  const rowActions = useMemo<ClientRowActions>(
    () => ({
      onView: (client) => setSelectedId(client.id),
      onEdit: (client) => setDialog({ kind: 'edit', client }),
      onRegisterPayment: (client) => openMoney(client, 'collect', collectable, 'registrar un pago'),
      onIssueInvoice: (client) => openMoney(client, 'invoice', invoiceable, 'emitir una factura'),
      onSendStatement: (client) => setSendStatementTarget(client),
      onAddExtraWork: (client) => openMoney(client, 'extra', (rows) => rows, 'cargar un trabajo extra'),
      onChurn: (client) => setDialog({ kind: 'confirm', client, action: 'churn' }),
      onDelete: (client) => setDialog({ kind: 'delete', client }),
      onLogHours: (client) => {
        if (!selfMemberId) return
        setClientTeamDialog({ kind: 'hours', client, selfMemberId })
      },
      onLogProduction: (client) => {
        if (!selfMemberId) return
        setClientTeamDialog({ kind: 'production', client })
      },
      onLogExtra: (client) => {
        if (!selfMemberId) return
        setClientTeamDialog({ kind: 'extra', client, selfMemberId })
      },
      onViewProductions: (client) => setClientTeamDialog({ kind: 'productions', client }),
    }),
    [openMoney, selfMemberId],
  )

  const columns = useMemo(
    () => clientColumns(rowActions, riskOf, role, capabilities),
    [rowActions, riskOf, role, capabilities],
  )

  const visibleClients = useMemo(
    () => (role === 'employee' ? (selfMemberId ? clients : []) : clients),
    [clients, role, selfMemberId],
  )

  function retry() {
    setReloadKey((key) => key + 1)
  }

  function closeIfStillOpen(matches: (current: ClientDialogState) => boolean) {
    setDialog((current) => (matches(current) ? { kind: 'none' } : current))
  }

  async function submitClient(
    mode: 'new' | 'edit',
    values: ClientFormValues,
    client: Client | null,
  ) {
    if (mode === 'edit' && client) {
      try {
        await updateClientViaApi(client.id, values)
      } catch {
        toast.error('No se pudo guardar el cliente')
        return
      }
      const now = new Date().toISOString()
      setData((prev) =>
        prev.map((item) =>
          item.id === client.id ? { ...applyFormToClient(item, values), updatedAt: now } : item,
        ),
      )
      toast.success('Cambios guardados')
    } else {
      try {
        const created = await createClientViaApi(values)
        setData((prev) => [created, ...prev])
        toast.success('Cliente creado')
      } catch {
        toast.error('No se pudo crear el cliente')
        return
      }
    }
    closeIfStillOpen((current) =>
      mode === 'edit'
        ? current.kind === 'edit' && current.client.id === client?.id
        : current.kind === 'new',
    )
  }

  function confirmPayment(
    receivableId: string,
    amount: number,
    collectedAt: string,
    treasuryAccountId?: string,
  ) {
    return collectReceivable(receivableId, amount, collectedAt, treasuryAccountId).then(
      () => undefined,
    )
  }

  async function confirmAction(client: Client, action: 'pause' | 'churn') {
    const status: ClientStatus = action === 'churn' ? 'churned' : 'paused'
    try {
      await setClientStatusViaApi(client.id, status)
    } catch {
      toast.error(action === 'churn' ? 'No se pudo deshabilitar al cliente' : 'No se pudo pausar al cliente')
      return
    }
    const now = new Date().toISOString()
    setData((prev) =>
      prev.map((item) => (item.id === client.id ? { ...item, status, updatedAt: now } : item)),
    )
    toast.success(action === 'churn' ? 'Cliente deshabilitado' : 'Cliente pausado')
    closeIfStillOpen(
      (current) =>
        current.kind === 'confirm' && current.client.id === client.id && current.action === action,
    )
  }

  async function confirmDelete(client: Client) {
    try {
      await deleteClientViaApi(client.id)
    } catch {
      toast.error('No se pudo eliminar el cliente')
      return
    }
    setData((prev) => prev.filter((item) => item.id !== client.id))
    setSelectedId((current) => (current === client.id ? null : current))
    setRowSelection((prev) => {
      if (!(client.id in prev)) return prev
      const next = { ...prev }
      delete next[client.id]
      return next
    })
    toast.success('Cliente eliminado')
    closeIfStillOpen((current) => current.kind === 'delete' && current.client.id === client.id)
  }

  const hasData = visibleClients.length > 0
  const tableContent =
    status === 'loading' ? (
      <ClientsLoading />
    ) : status === 'error' ? (
      <ClientsError onRetry={retry} />
    ) : !hasData ? (
      role === 'employee' ? (
        <ClientsEmptyNoAssignments />
      ) : (
        <ClientsEmptyGeneral onNewClient={() => setDialog({ kind: 'new' })} />
      )
    ) : (
      <div className="flex flex-col gap-4 md:gap-6">
        {role !== 'employee' ? <ClientsSummaryKpis clients={clients} /> : null}
        <DataTable
        columns={columns}
        data={visibleClients}
        pageSize={48}
        pinActionsColumn
        initialColumnVisibility={{ risk: false, lastIncreaseDate: false, lastMeetingDate: false, nextAction: false }}
        globalFilterFn={globalFilterFn}
        getRowId={(client) => client.id}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        columnFilters={toColumnFilters(listFilters)}
        onColumnFiltersChange={(updater) =>
          setListFilters((prev) =>
            fromColumnFilters(
              typeof updater === 'function' ? updater(toColumnFilters(prev)) : updater,
            ),
          )
        }
        onRowClick={role === 'employee' ? undefined : (client) => setSelectedId(client.id)}
        toolbar={(table) => (
          <ClientsToolbar
            table={table}
            onBulkInvoice={bulkInvoice}
            onBulkChangeStatus={(clients) => setChangeStatusTarget(clients)}
            onBulkExport={exportClients}
          />
        )}
        emptyState={(table) => (
          <ClientsEmptyFiltered
            onClearFilters={() => {
              table.resetColumnFilters()
              table.setGlobalFilter('')
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
          <BreadcrumbPage>Clientes</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  ) : null

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
            title="Clientes"
            description={
              role === 'employee'
                ? 'Tus clientes asignados y el estado de cada cuenta.'
                : 'Gestioná clientes, servicios contratados, rentabilidad y facturación.'
            }
            actions={
              role === 'employee'
                ? undefined
                : [
                    {
                      key: 'export',
                      label: 'Exportar',
                      icon: AFFORDANCE.download,
                      variant: 'outlined',
                      iconOnly: true,
                      onClick: () => exportClients(visibleClients),
                    },
                    ...(canDo('client.create')
                      ? [
                          {
                            key: 'new',
                            label: 'Nuevo cliente',
                            icon: AFFORDANCE.create,
                            variant: 'solid' as const,
                            leadingIcon: true,
                            mobileIconOnly: true,
                            primary: true,
                            onClick: () => setDialog({ kind: 'new' }),
                          },
                        ]
                      : []),
                  ]
            }
          />
        </div>
        <div className={cn('flex min-h-0 flex-col', dissolved ? 'absolute inset-0' : 'flex-1')}>
          <PageContent>
            <MasterDetailLayout
              selectedId={inDetail ? selectedId : null}
              detailType="medium"
              onModeChange={setMode}
              onCloseDetail={() => setSelectedId(null)}
              detailTitle="Detalle del cliente"
              table={
                <div className={cn('px-4 md:px-6 lg:px-8 desktop:px-10', dissolved && 'pt-[var(--md-table-offset)]')}>
                  {tableContent}
                </div>
              }
              list={
                <ClientsList
                  clients={visibleClients}
                  selectedId={selectedId}
                  onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
                  breadcrumb={breadcrumbNode}
                  filters={listFilters}
                  onFiltersChange={setListFilters}
                  riskOf={riskOf}
                  picked={pickedIds}
                  onTogglePick={togglePick}
                  onClearPicked={clearPicked}
                  onBulkInvoice={bulkInvoice}
                  onBulkChangeStatus={(clients) => setChangeStatusTarget(clients)}
                  onBulkExport={exportClients}
                />
              }
              detail={
                <ClientDetail
                  client={selected}
                  onClose={() => setSelectedId(null)}
                  onEdit={(client) => setDialog({ kind: 'edit', client })}
                  onRegisterPayment={(client) =>
                    openMoney(client, 'collect', collectable, 'registrar un pago')
                  }
                  onIssueInvoice={(client) =>
                    openMoney(client, 'invoice', invoiceable, 'emitir una factura')
                  }
                  onWhatsAppClient={(client) =>
                    window.open(
                      whatsappLink(client, contactDraft(client).body),
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                  onContactClient={(client) => setDialog({ kind: 'contact', client })}
                  onChurn={(client) => setDialog({ kind: 'confirm', client, action: 'churn' })}
                  onReviewProfitability={(client) =>
                    hasCapability(capabilities, 'profitability')
                      ? navigate('/reports?tab=rentabilidad')
                      : setDialog({ kind: 'edit', client })
                  }
                  onContractChange={refreshClients}
                />
              }
            />
          </PageContent>
        </div>
      </div>
      <ClientsDialogs
        state={dialog}
        onClose={() => setDialog({ kind: 'none' })}
        onSubmitClient={submitClient}

        onConfirmAction={confirmAction}
        onConfirmDelete={confirmDelete}
      />
      <ClientTeamDialogs
        state={clientTeamDialog}
        onClose={() => setClientTeamDialog({ kind: 'none' })}
        onSwitch={setClientTeamDialog}
      />
      {changeStatusTarget ? (
        <ClientsChangeStatusDialog
          clients={changeStatusTarget}
          onConfirm={(status) => applyStatus(changeStatusTarget, status)}
          onClose={() => setChangeStatusTarget(null)}
        />
      ) : null}
      <ClientMoneyDialogs
        state={moneyDialog}
        emitters={emitters}
        emittersFailed={emittersFailed}
        receivablesFailed={receivablesFailed}
        onPick={(kind, client, receivable) => setMoneyDialog({ kind, client, receivable })}
        onCollect={confirmPayment}
        onAddExtra={addExtraWork}
        onGenerateInvoice={issueInvoice}
        onRetry={() => {
          refetchReceivables()
          refetchEmitters()
        }}
        onClose={() => setMoneyDialog({ kind: 'none' })}
      />
      {bulkInvoiceState ? (
        <BulkInvoicePlanDialog
          plan={bulkInvoiceState}
          pending={bulkInvoicePending}
          onConfirm={() => runBulkInvoice(bulkInvoiceState)}
          onClose={() => setBulkInvoiceState(null)}
        />
      ) : null}
      {sendStatementTarget ? (
        <ClientSendStatementDialog
          client={sendStatementTarget}
          onSent={() => toast.success('Borrador abierto en tu mail o WhatsApp')}
          onClose={() => setSendStatementTarget(null)}
        />
      ) : null}
    </TooltipProvider>
  )
}
