import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { FilterFn } from '@tanstack/react-table'

import { PageHeader, PageContent, SectionAccordionCard } from '@/app/components/templates'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Sheet,
  SheetContent,
  SheetTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TooltipProvider,
  toast,
} from '@/app/components/components'
import { AiInsight, DataTable, Toolbar } from '@/app/components/patterns'
import { ICON } from '@/app/lib/icon-registry'
import { trailToHere } from '@/app/lib/nav-trail'
import { TrailBreadcrumb } from './trail-breadcrumb'
import {
  type ClientMonth,
  type MonthId,
  type ProductionRecord,
  type TeamPayout,
} from './monthly-operation-mock-data'
import {
  cierreFigures,
  clientSearchText,
  formatCompactCurrency,
  formatPercent,
  monthInsight,
  payoutSearchText,
} from './monthly-operation-format'
import { useMonthlyOperation, useRevalidateOnOpen } from './monthly-operation-data'
import { MonthlyOperationError, MonthlyOperationLoading } from './monthly-operation-states'
import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { MonthSelector } from './monthly-operation-summary'
import { MonthSummarySection } from './monthly-month-summary'
import { monthlyClientColumns, type MonthlyClientRowActions } from './monthly-clients-columns'
import { MonthlyClientDetail } from './monthly-client-detail'
import { monthlyTeamColumns, type MonthlyTeamRowActions } from './monthly-team-columns'
import { MonthlyTeamDetail } from './monthly-team-detail'
import { ProductionsTab } from './monthly-productions'
import { ExpensesTab } from './monthly-expenses'
import { MonthlyOperationDialogs, type MonthlyDialogState } from './monthly-operation-dialogs'
import { CloseMonthDialog } from './monthly-close-dialog'

type TeamView = 'pagos' | 'producciones' | 'gastos'

type MonthlyBlock = 'estado' | 'clientes' | 'equipo'

const PROFITABILITY_CIERRE_LABELS = new Set([
  'Rentabilidad neta',
  'Margen promedio',
  'Clientes con margen negativo',
])

const clientFilterFn: FilterFn<ClientMonth> = (row, _columnId, value) =>
  clientSearchText(row.original).includes(String(value).toLowerCase())

const payoutFilterFn: FilterFn<TeamPayout> = (row, _columnId, value) =>
  payoutSearchText(row.original).includes(String(value).toLowerCase())

function parseMonthlyBlock(value: string | null): MonthlyBlock | null {
  return value === 'estado' || value === 'clientes' || value === 'equipo' ? value : null
}

function SearchToolbar({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <Toolbar search={{ value, onChange, placeholder: label }} />
}

function SectionSummary({
  amount,
  percent,
  qualifier,
}: {
  amount: number
  percent: string
  qualifier: string
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="type-body-2 tabular-nums fg-default">{formatCompactCurrency(amount)}</span>
      <span className="whitespace-nowrap type-caption tabular-nums fg-subtle">
        {percent}
        <span className="hidden md:inline"> {qualifier}</span>
      </span>
    </span>
  )
}

function MonthlyOperationPageInner() {
  const op = useMonthlyOperation()
  useRevalidateOnOpen(op.selectedMonthId)
  const { capabilities, canDo } = useRole()
  const [searchParams, setSearchParams] = useSearchParams()
  const [teamView, setTeamView] = useState<TeamView>(() => {
    const requested = searchParams.get('view')
    return requested === 'producciones' || requested === 'gastos' ? requested : 'pagos'
  })
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<MonthlyDialogState>({ kind: 'none' })
  const [closeOpen, setCloseOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)

  const [initialBlock] = useState<MonthlyBlock | null>(() => parseMonthlyBlock(searchParams.get('block')))

  const { selectMonth } = op
  useEffect(() => {
    const raw = searchParams.get('period')
    const match = raw?.match(/^(\d{4}-\d{2})(?:-\d{2})?$/)
    if (match) selectMonth(match[1] as MonthId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const alertsRef = useRef<HTMLDivElement>(null)
  const clientsRef = useRef<HTMLDivElement>(null)
  const teamRef = useRef<HTMLDivElement>(null)

  const closeDialog = () => setDialog({ kind: 'none' })

  useEffect(() => {
    const intent = searchParams.get('new')
    if (intent !== 'cobro' && intent !== 'pago') return
    setDialog({ kind: intent === 'cobro' ? 'pick-client-payment' : 'pick-team-payout' })
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('new')
        return next
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])

  useEffect(() => {
    const open = searchParams.get('open')
    if (!open) return
    if (initialBlock === 'clientes') {
      const match = op.data.clients.find((client) => client.id === open || client.clientId === open)
      if (match) setSelectedClientId(match.id)
    } else if (initialBlock === 'equipo') {
      const match = op.data.team.find((payout) => payout.id === open || payout.memberId === open)
      if (match) {
        setSelectedPayoutId(match.id)
        setTeamView('pagos')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const target = initialBlock === 'clientes' ? clientsRef : initialBlock === 'equipo' ? teamRef : null
    target?.current?.scrollIntoView({ block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function changeMonth(id: string) {
    op.selectMonth(id)
    setSelectedClientId(null)
    setSelectedPayoutId(null)
  }

  const clientActions = useMemo<MonthlyClientRowActions>(
    () => ({
      onView: (client) => setSelectedClientId(client.id),
      onRegisterPayment: (client) => setDialog({ kind: 'client-payment', client }),
      onMarkInvoiced: (client) => op.setClientInvoiceStatus(client.id, 'issued'),
      onIssueInvoice: (client) => op.setClientInvoiceStatus(client.id, 'sent'),
      onAddExtra: (client) => setDialog({ kind: 'client-extra', client, adjustment: false }),
      onAddAdjustment: (client) => setDialog({ kind: 'client-extra', client, adjustment: true }),
      onAddNote: (client) => setDialog({ kind: 'client-note', client }),
      onSetEffectiveDate: (client) => setDialog({ kind: 'client-effective-date', client }),
      onReviewProfitability: async (client) => {
        if (client.monthStatus !== 'pending_review') return
        if (!(await op.reviewClient(client.id))) return
        if (!(await op.setChecklistItem('profitability_reviewed', true))) return
        toast.success('Rentabilidad revisada')
      },
    }),
    [op],
  )

  const teamActions = useMemo<MonthlyTeamRowActions>(
    () => ({
      onView: (payout) => setSelectedPayoutId(payout.id),
      onAdvanceStatement: (payout) => setDialog({ kind: 'team-statement', payout }),
      onRegisterPayout: (payout) => setDialog({ kind: 'team-payout', payout }),
      onAddAdjustment: (payout) => setDialog({ kind: 'team-adjustment', payout }),
      onEditBank: (payout) => setDialog({ kind: 'team-bank', payout }),
    }),
    [],
  )

  const clientColumns = useMemo(() => monthlyClientColumns(clientActions, op.locked), [clientActions, op.locked])
  const teamColumns = useMemo(
    () => monthlyTeamColumns(teamActions, op.locked, capabilities),
    [teamActions, op.locked, capabilities],
  )

  const selectedClient = op.data.clients.find((c) => c.id === selectedClientId) ?? null
  const selectedPayout = op.data.team.find((p) => p.id === selectedPayoutId) ?? null
  const payoutProductions = selectedPayout
    ? op.data.productions.filter(
        (production) =>
          production.responsible === selectedPayout.name ||
          production.participants.includes(selectedPayout.name),
      )
    : []

  const heldDetail = useRef<{ client: ClientMonth | null; payout: TeamPayout | null; productions: ProductionRecord[] }>({
    client: null,
    payout: null,
    productions: [],
  })
  if (selectedClient) heldDetail.current.client = selectedClient
  if (selectedPayout) heldDetail.current = { ...heldDetail.current, payout: selectedPayout, productions: payoutProductions }

  const clientDetail = selectedClient ?? heldDetail.current.client
  const payoutDetail = selectedPayout ?? heldDetail.current.payout
  const payoutDetailProductions = selectedPayout ? payoutProductions : heldDetail.current.productions

  const insight = monthInsight(op.data, op.status, op.blockers, hasCapability(capabilities, 'profitability'))
  const summary = op.summary
  const collectedPct = summary.totalToCollect > 0 ? (summary.collected / summary.totalToCollect) * 100 : 0
  const paidPct = summary.totalToPayTeam > 0 ? (summary.paidToTeam / summary.totalToPayTeam) * 100 : 0
  const teamRemaining = summary.totalToPayTeam - summary.paidToTeam

  const onInsightCta = useCallback(() => {
    switch (insight.cta?.kind) {
      case 'resolve-alerts':
        alertsRef.current?.scrollIntoView({ block: 'center' })
        break
      case 'review-collections':
        clientsRef.current?.scrollIntoView({ block: 'start' })
        break
      case 'review-blockers':
      case 'close-month':
        setCloseOpen(true)
        break
    }
  }, [insight.cta?.kind])

  const draftStatements = op.data.team.filter((payout) => payout.statementStatus === 'draft').length

  async function confirmReopen() {
    if (await op.reopenMonth()) {
      setReopenOpen(false)
      toast.success('Mes reabierto')
    }
  }

  async function confirmClose() {
    if (await op.closeMonth()) {
      setCloseOpen(false)
      toast.success(`${op.month.label} cerrado`)
    }
  }

  const [clientQuery, setClientQuery] = useState('')
  const [teamQuery, setTeamQuery] = useState('')

  const trail = trailToHere(searchParams, '/operacion-mensual')

  if (op.loadStatus !== 'ready') {
    return (
      <TooltipProvider>
        <PageHeader
          eyebrow="Hold"
          eyebrowHidden
          title="Operación mensual"
          description="Centralizá cobros, pagos, producción, facturación y alertas del período."
          controls={
            <MonthSelector months={op.months} selectedMonthId={op.selectedMonthId} onSelect={changeMonth} />
          }
        />
        <PageContent>
          {op.loadStatus === 'error' ? (
            <MonthlyOperationError onRetry={op.retry} />
          ) : (
            <MonthlyOperationLoading />
          )}
        </PageContent>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <PageHeader
        eyebrow="Hold"
        eyebrowHidden
        title="Operación mensual"
        description="Centralizá cobros, pagos, producción, facturación y alertas del período."
        breadcrumb={trail.length > 0 ? <TrailBreadcrumb trail={trail} leaf="Operación mensual" /> : undefined}
        controls={
          <MonthSelector months={op.months} selectedMonthId={op.selectedMonthId} onSelect={changeMonth} />
        }
        actions={
          op.status === 'closed'
            ? canDo('month.reopen')
              ? [
                  {
                    key: 'reopen',
                    label: 'Reabrir mes',
                    icon: ICON.reopenMonth,
                    variant: 'solid' as const,
                    leadingIcon: true,
                    primary: true,
                    onClick: () => setReopenOpen(true),
                  },
                ]
              : []
            : canDo('month.close')
              ? [
                  {
                    key: 'close',
                    label: 'Cerrar mes',
                    icon: ICON.closeMonth,
                    variant: 'solid' as const,
                    leadingIcon: true,
                    primary: true,
                    onClick: () => setCloseOpen(true),
                  },
                ]
              : []
        }
      />

      <PageContent>
        <div className="flex flex-col gap-4 px-4 md:gap-6 md:px-6 lg:px-8 desktop:px-10">
          <AiInsight
            variant="prominent"
            headline={insight.headline}
            ctaLabel={insight.cta?.label}
            onCta={insight.cta ? onInsightCta : undefined}
          />

          <MonthSummarySection alertsRef={alertsRef} />

          <div ref={clientsRef}>
            <SectionAccordionCard
              title="Clientes y cobros"
              value="clientes"
              defaultOpen={initialBlock === 'clientes'}
              contentInset={false}
              summary={
                <SectionSummary
                  amount={summary.pendingToCollect}
                  percent={formatPercent(collectedPct)}
                  qualifier="cobrado"
                />
              }
            >
              <DataTable
                columns={clientColumns}
                data={op.data.clients}
                pageSize={25}
                globalFilterFn={clientFilterFn}
                getRowId={(client) => client.id}
                pinActionsColumn
                onRowClick={(client) => setSelectedClientId(client.id)}
                toolbar={(table) => (
                  <SearchToolbar
                    label="Buscar cliente"
                    value={clientQuery}
                    onChange={(value) => {
                      setClientQuery(value)
                      table.setGlobalFilter(value)
                    }}
                  />
                )}
                emptyState={() => <span>No hay clientes en este mes</span>}
              />
            </SectionAccordionCard>
          </div>

          <div ref={teamRef}>
            <SectionAccordionCard
              title="Equipo y pagos"
              value="equipo"
              defaultOpen={initialBlock === 'equipo'}
              contentInset={false}
              summary={
                <SectionSummary
                  amount={teamRemaining}
                  percent={formatPercent(paidPct)}
                  qualifier="pagado"
                />
              }
            >
              <div className="flex flex-col gap-4">
                <Tabs value={teamView} onValueChange={(value) => setTeamView(value as TeamView)}>
                  <TabsList>
                    <TabsTrigger value="pagos">Pagos</TabsTrigger>
                    <TabsTrigger value="producciones">Producciones</TabsTrigger>
                    <TabsTrigger value="gastos">Gastos</TabsTrigger>
                  </TabsList>
                </Tabs>

                {teamView === 'pagos' ? (
                  <DataTable
                    columns={teamColumns}
                    data={op.data.team}
                    pageSize={25}
                    globalFilterFn={payoutFilterFn}
                    getRowId={(payout) => payout.id}
                    pinActionsColumn
                    onRowClick={(payout) => setSelectedPayoutId(payout.id)}
                    toolbar={(table) => (
                      <Toolbar
                        search={{
                          value: teamQuery,
                          onChange: (value) => {
                            setTeamQuery(value)
                            table.setGlobalFilter(value)
                          },
                          placeholder: 'Buscar persona',
                        }}
                        trailing={
                          <Button
                            variant="outlined"
                            color="primary"
                            disabled={op.locked || draftStatements === 0}
                            onClick={() => setDialog({ kind: 'team-statement-bulk' })}
                          >
                            <span className="sm:hidden">Aprobar todas</span>
                            <span className="hidden sm:block">Aprobar cuentas corrientes</span>
                          </Button>
                        }
                      />
                    )}
                    emptyState={() => <span>No hay pagos en este mes</span>}
                  />
                ) : teamView === 'producciones' ? (
                  <ProductionsTab />
                ) : (
                  <ExpensesTab />
                )}
              </div>
            </SectionAccordionCard>
          </div>
        </div>
      </PageContent>

      <Sheet
        open={selectedClient != null}
        onOpenChange={(open) => (open ? undefined : setSelectedClientId(null))}
      >
        <SheetContent side="right" aria-describedby={undefined} showCloseButton={false}>
          <SheetTitle className="sr-only">Detalle del cliente</SheetTitle>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <MonthlyClientDetail
              client={clientDetail}
              locked={op.locked}
              onClose={() => setSelectedClientId(null)}
              onRegisterPayment={clientActions.onRegisterPayment}
              onMarkInvoiced={clientActions.onMarkInvoiced}
              onIssueInvoice={clientActions.onIssueInvoice}
              onAddExtra={clientActions.onAddExtra}
              onAddNote={clientActions.onAddNote}
              onSetEffectiveDate={clientActions.onSetEffectiveDate}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={selectedPayout != null}
        onOpenChange={(open) => (open ? undefined : setSelectedPayoutId(null))}
      >
        <SheetContent side="right" aria-describedby={undefined} showCloseButton={false}>
          <SheetTitle className="sr-only">Detalle del pago</SheetTitle>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <MonthlyTeamDetail
              payout={payoutDetail}
              productions={payoutDetailProductions}
              locked={op.locked}
              onClose={() => setSelectedPayoutId(null)}
              onRegisterPayout={teamActions.onRegisterPayout}
              onAddAdjustment={teamActions.onAddAdjustment}
              onAdvanceStatement={teamActions.onAdvanceStatement}
              onEditBank={teamActions.onEditBank}
            />
          </div>
        </SheetContent>
      </Sheet>

      <MonthlyOperationDialogs state={dialog} onClose={closeDialog} onPick={setDialog} />
      {closeOpen ? (
        <CloseMonthDialog
          monthLabel={op.month.label}
          figures={
            hasCapability(capabilities, 'profitability')
              ? cierreFigures(op.data)
              : cierreFigures(op.data).filter((figure) => !PROFITABILITY_CIERRE_LABELS.has(figure.label))
          }
          blockers={op.blockers}
          onClose={() => setCloseOpen(false)}
          onConfirm={confirmClose}
        />
      ) : null}
      {reopenOpen ? (
        <AlertDialog open onOpenChange={(open) => (open ? undefined : setReopenOpen(false))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reabrir mes</AlertDialogTitle>
              <AlertDialogDescription>
                Reabrir {op.month.label} desbloquea la edición de equipo, cobros, pagos, producciones,
                gastos y rentabilidad, y revierte el cierre. Podés volver a cerrarlo cuando termines.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setReopenOpen(false)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault()
                  void confirmReopen()
                }}
              >
                Reabrir mes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </TooltipProvider>
  )
}

export function MonthlyOperationPage() {
  return <MonthlyOperationPageInner />
}
