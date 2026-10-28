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

/** The contextual sub-views inside the Equipo y pagos section. */
type TeamView = 'pagos' | 'producciones' | 'gastos'

/**
 * The page's three sections. They are no longer mutually-exclusive tabs: the month
 * summary is always visible and the two work sections are independently collapsible,
 * both CLOSED by default so the month's read is what the page opens on. The name
 * survives because dashboards deep-link with `?block=`, which now decides which section
 * opens and scrolls into view rather than which one exists.
 */
type MonthlyBlock = 'estado' | 'clientes' | 'equipo'

/** Cierre figures that need the `profitability` capability (profitability / margins);
 *  a role without it sees the operational figures but not these. */
const PROFITABILITY_CIERRE_LABELS = new Set([
  'Rentabilidad neta',
  'Margen promedio',
  'Clientes con margen negativo',
])

const clientFilterFn: FilterFn<ClientMonth> = (row, _columnId, value) =>
  clientSearchText(row.original).includes(String(value).toLowerCase())

const payoutFilterFn: FilterFn<TeamPayout> = (row, _columnId, value) =>
  payoutSearchText(row.original).includes(String(value).toLowerCase())

/** Parse a raw `?block=` value into a `MonthlyBlock`, or `null` when it is not one. */
function parseMonthlyBlock(value: string | null): MonthlyBlock | null {
  return value === 'estado' || value === 'clientes' || value === 'equipo' ? value : null
}

/** A search-only `Toolbar`. The page owns the query (it also feeds the section's own
 *  filtering), so the call site mirrors it into the table's global filter. */
function SearchToolbar({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <Toolbar search={{ value, onChange, placeholder: label }} />
}

/** The collapsed-state summary on a section card: the amount still outstanding plus the
 *  share already settled. Pins its own `type-*` so it does not inherit the trigger's
 *  `type-section` title scale, and stays `fg-default` — the figure is not a status. */
/**
 * Collapsed-trigger summary for a section card: the section's total, then the share of
 * it already settled.
 *
 * The qualifier ("cobrado" / "pagado") is DESKTOP-ONLY. In the collapsed trigger on a
 * phone there is no room for it: it wraps onto a second line, which drags the chevron
 * out of line and forces the section title to wrap too. The title already says what is
 * being measured, so below `md` the percentage carries the meaning on its own.
 */
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
  // Which inner tab of "Equipo y pagos" is showing. Seeded from `?view=` so a CTA that
  // says "Ver gasto" can actually land on Gastos instead of dropping the reader on Pagos
  // to find it themselves. Unknown/absent values fall back to Pagos.
  const [teamView, setTeamView] = useState<TeamView>(() => {
    const requested = searchParams.get('view')
    return requested === 'producciones' || requested === 'gastos' ? requested : 'pagos'
  })
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<MonthlyDialogState>({ kind: 'none' })
  const [closeOpen, setCloseOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)

  // The deep-linked section, read ONCE at mount: it seeds which accordion starts open
  // (the section cards are uncontrolled) and which one we scroll to. Dashboards deep-link
  // here with ?block=clientes|equipo.
  const [initialBlock] = useState<MonthlyBlock | null>(() => parseMonthlyBlock(searchParams.get('block')))

  /**
   * `?period=` seeds the month, once, on mount.
   *
   * Read HERE and not in `MonthlyOperationProvider`: that provider is mounted at the
   * router (`router.tsx`) and wraps several routes, so reading the param there would
   * let a `?period=` meant for /cobros re-scope the monthly operation behind it.
   *
   * NORMALIZED, not merely validated — `/pagos` links here with a Payment's period,
   * which is `YYYY-MM-DD`, while `MonthId` is `YYYY-MM`. Accepting only the exact
   * shape is how `cobranza-page.tsx` describes the same link silently falling back to
   * the default and landing the reader on the wrong month; here that would book a
   * liquidación against a month nobody chose.
   */
  const { selectMonth } = op
  useEffect(() => {
    const raw = searchParams.get('period')
    const match = raw?.match(/^(\d{4}-\d{2})(?:-\d{2})?$/)
    if (match) selectMonth(match[1] as MonthId)
    // Mount only: after this the in-page selector owns the month, and re-running
    // would drag the user back to the linked one every time they changed it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const alertsRef = useRef<HTMLDivElement>(null)
  const clientsRef = useRef<HTMLDivElement>(null)
  const teamRef = useRef<HTMLDivElement>(null)

  const closeDialog = () => setDialog({ kind: 'none' })

  // Open the cobro/pago row picker when arriving from the global "Nuevo" launcher
  // (?new=cobro|pago), then strip the param so it fires once.
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

  // Seed an open detail from ?open= once on mount, matching the deep-linked section.
  // Resolves the row by its id or canonical id (clientId / memberId) so a CTA can pass
  // either; unknown ids are ignored.
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

  // Scroll the deep-linked section into view once the page has painted. `estado` is
  // already at the top, so only the two work sections need scrolling.
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

  // ── Client actions ──
  const clientActions = useMemo<MonthlyClientRowActions>(
    () => ({
      onView: (client) => setSelectedClientId(client.id),
      onRegisterPayment: (client) => setDialog({ kind: 'client-payment', client }),
      // No invoice-status endpoint exists: these flip a session-only override that the next
      // reload wipes. The row badge changing IS the feedback, and it is honest about being
      // local. A success toast would not be — it would report a save that never happened.
      // The backwards-transition guard lives in `setClientInvoiceStatus` (monthly-operation-data),
      // the single chokepoint both this menu and the detail panel go through.
      onMarkInvoiced: (client) => op.setClientInvoiceStatus(client.id, 'issued'),
      onIssueInvoice: (client) => op.setClientInvoiceStatus(client.id, 'sent'),
      onAddExtra: (client) => setDialog({ kind: 'client-extra', client, adjustment: false }),
      onAddAdjustment: (client) => setDialog({ kind: 'client-extra', client, adjustment: true }),
      onAddNote: (client) => setDialog({ kind: 'client-note', client }),
      onSetEffectiveDate: (client) => setDialog({ kind: 'client-effective-date', client }),
      // Two independent writes, run in sequence rather than concurrently: each reloads the
      // bundle on success, so racing them would have the two reloads clobber each other. If
      // the review does not persist, the checklist must not be ticked as though it had.
      onReviewProfitability: async (client) => {
        // Only clients pending review actually transition, and the write PERSISTS with no UI
        // path to undo it — so a non-pending client is a silent no-op rather than a spurious
        // (and irreversible) "reviewed" write.
        if (client.monthStatus !== 'pending_review') return
        if (!(await op.reviewClient(client.id))) return
        if (!(await op.setChecklistItem('profitability_reviewed', true))) return
        toast.success('Rentabilidad revisada')
      },
    }),
    [op],
  )

  // ── Team actions ──
  const teamActions = useMemo<MonthlyTeamRowActions>(
    () => ({
      onView: (payout) => setSelectedPayoutId(payout.id),
      // The statement's next lifecycle step, confirmed before it runs: it changes what
      // the studio owes and what the month may close on, and `confirm` is irreversible.
      onAdvanceStatement: (payout) => setDialog({ kind: 'team-statement', payout }),
      onRegisterPayout: (payout) => setDialog({ kind: 'team-payout', payout }),
      onAddAdjustment: (payout) => setDialog({ kind: 'team-adjustment', payout }),
      onEditBank: (payout) => setDialog({ kind: 'team-bank', payout }),
    }),
    // No dependency on `op` anymore: every team action now opens a dialog, and the
    // dialog reads the provider itself. Keeping `op` here would rebuild the actions
    // (and the column defs below them) on every bundle reload for nothing.
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

  // Freeze the last opened record. Closing a Sheet nulls the selection on the same tick,
  // but Radix keeps the panel mounted through its exit animation — so rendering the live
  // (now-null) record would slide the panel out empty. Rendering the held copy during that
  // window keeps the content on screen until the panel is gone. Same guard
  // MasterDetailLayout applies to its own Sheet branch.
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

  // The same merged list the close dialog gets, so the headline cannot promise a close
  // the dialog refuses.
  const insight = monthInsight(op.data, op.status, op.blockers, hasCapability(capabilities, 'profitability'))
  const summary = op.summary
  const collectedPct = summary.totalToCollect > 0 ? (summary.collected / summary.totalToCollect) * 100 : 0
  const paidPct = summary.totalToPayTeam > 0 ? (summary.paidToTeam / summary.totalToPayTeam) * 100 : 0
  const teamRemaining = summary.totalToPayTeam - summary.paidToTeam

  /**
   * The insight's CTA resolves the SAME signal its headline reports (the CTA-resolution
   * rule): `monthInsight` returns a `{ label, kind }`
   * descriptor and each `kind` maps to the surface that fixes it. A closed month reports an
   * outcome rather than a blocker, so it carries no CTA and none of these branches run.
   */
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

  // How many statements the bulk action would actually touch. It also decides whether
  // the button is offerable at all: with nothing in draft there is no work to confirm.
  const draftStatements = op.data.team.filter((payout) => payout.statementStatus === 'draft').length

  async function confirmReopen() {
    // Reopening reverts a completed close (it unlocks edits on a settled accounting period),
    // so the confirm dialog gates it, mirroring the close flow.
    // `reopenMonth` reports its own failure and resolves either way — it does not throw — so
    // branch on the returned outcome: a failed reopen must leave the dialog OPEN and must not
    // toast success.
    if (await op.reopenMonth()) {
      setReopenOpen(false)
      toast.success('Mes reabierto')
    }
  }

  async function confirmClose() {
    // `closeMonth` owns the failure message now: it can tell the month's own pending
    // validations from a server refusal and name the blocker that fired. A generic
    // line here would overwrite that with "resolvé las validaciones" for both.
    if (await op.closeMonth()) {
      setCloseOpen(false)
      toast.success(`${op.month.label} cerrado`)
    }
  }

  const [clientQuery, setClientQuery] = useState('')
  const [teamQuery, setTeamQuery] = useState('')

  // Contextual back-trail when deep-linked from a dashboard CTA or a Reportes row
  // (`?trail=`); empty for direct nav, so no breadcrumb renders.
  const trail = trailToHere(searchParams, '/operacion-mensual')

  // The bundle fetch owns the page BODY. Until it resolves, no figure may render: the
  // provider seeds every period with EMPTY_DATA, so an unloaded month is not blank, it is
  // zero, and a zeroed month renders a full KPI strip plus a green `Rentabilidad estimada $0`.
  //
  // What is withheld is the CLOSE ACTION, and that is the load-bearing part: `closeBlockers`
  // derives every blocker from the month's ROWS (`data.clients.filter(...)`,
  // `data.team.filter(...)`), so against EMPTY_DATA it returns ZERO blockers and `closeMonth`
  // would sail through and POST the close. A month that never loaded must not be closable.
  //
  // The MonthSelector STAYS in both states, though. Changing the month is what puts the page
  // back into `loading` (the load effect keys on `selectedMonthId`), so dropping the selector
  // there would make the control vanish under the user the moment they used it, and strand
  // them until the fetch settled. It is also the only way out of a month that failed to load.
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
        // ONE action. "Ver reporte" used to sit here as a second, outlined icon-only
        // button, which is what forced the header into an overflow: a second action means
        // a "…" menu on the mobile pill and an extra icon button on desktop, both spent on
        // a plain navigation the SideNav already offers ("Reportes"). Closing the month is
        // the only thing this header actually does.
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
        {/* One scrolling column: the month's read at the top, then the two work sections
            as independently-collapsible cards. The page column owns the horizontal
            gutter (header-hierarchy spacing-ownership), so nothing inside re-insets. */}
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
                {/* The tab list, alone. "Generar cuentas" used to sit beside it — but it
                    generates a current-account statement for every team PAYOUT
                    (`generateAllStatements` walks `op.data.team`), so it belongs to the Pagos
                    tab and to no other. Mounted in the tab row it survived into Producciones
                    and Gastos, where it means nothing and competes with each tab's real CTA
                    ("Cargar producción" / "Agregar gasto"), and on a phone the row's
                    `flex-wrap` dropped it onto a line of its own above the tab body. It lives
                    in the Pagos toolbar now, at every width: an action belongs to the thing it
                    acts on, not to the container that happens to hold it. */}
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

      {/* Row detail opens in a Sheet rather than a master-detail split: the page is one
          scrolling column now, and MasterDetailLayout's desktop split needs a
          height-bounded flex parent it can no longer be given. */}
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
              {/* `preventDefault` is load-bearing: AlertDialogAction is a Radix Dialog.Close, so
                  without it the dialog closes synchronously on click — before the async reopen
                  resolves — and a FAILED reopen would dismiss the confirm anyway. Let
                  `confirmReopen` own the close so it only happens on a confirmed write. */}
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

/**
 * Operación mensual — the monthly-closing operating hub (route `/operacion-mensual`).
 * The MVP centre of gravity, presented as ONE scrolling page: an AI insight naming what
 * blocks the close (with a CTA that resolves exactly that), then the month's figures +
 * the priority-alert checklist + the monotributo caps, then two independently-collapsible
 * work sections — Clientes y cobros and Equipo y pagos (with its producciones/gastos
 * toggle). Row detail opens in a Sheet. Closing the month happens from the header action
 * via the CloseMonthDialog. Consumes the shared MonthlyOperationProvider mounted at the
 * router root, so the monthly dataset is one source of truth.
 */
export function MonthlyOperationPage() {
  return <MonthlyOperationPageInner />
}
