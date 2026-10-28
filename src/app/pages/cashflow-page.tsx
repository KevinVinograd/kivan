import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { queryKeys } from '@/queries/keys'
import { useNavigate, useSearchParams } from 'react-router'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

import { PageContent, PageHeader, type PageHeaderAction } from '@/app/components/templates'
import { Tabs, TabsContent, TabsList, TabsTrigger, TooltipProvider } from '@/app/components/components'
import { AFFORDANCE, ICON } from '@/app/lib/icon-registry'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { currentPeriod } from '@/app/lib/periods'
import { CashflowAccountDialog } from './cashflow-account-dialog'
import { CashflowCommitmentDialog } from './cashflow-commitment-dialog'
import { CobrosCreateCobroDialog } from './cobros-create-cobro-dialog'
import { PagosCreatePagoDialog } from './pagos-create-pago-dialog'
import { useReceivables } from './receivables-data'
import { usePayments } from './payments-data'
import { useTreasury } from './treasury-data'
import { projectCashflow } from './treasury-format'
import type { Currency } from './treasury-mock-data'
import { laneAmount, projectionLanes, saldosByLane } from './treasury-position'
import { buildPositionModel } from './treasury-position-view'
import { fetchOutstandingPayouts, pendingPayoutRows } from './treasury-pending-payouts'
import { useTeamData } from './team-data'
import { reconciliationRows, reconciliationSummary } from './treasury-view'
import { CashflowPosition } from './cashflow-position'
import { CashflowProjection } from './cashflow-projection'
import { CashflowError, CashflowLoading } from './cashflow-states'
import { CashflowRegister } from './cashflow-register'
import { CashflowReconciliation } from './cashflow-reconciliation'

/** Window-hint anchor date, e.g. "1 de Jun 2026" (abbreviated, capitalized month). */
function formatAnchorDate(iso: string): string {
  const date = parseISO(iso)
  const month = format(date, 'LLL', { locale: es })
  return `${format(date, 'd', { locale: es })} de ${month.charAt(0).toUpperCase()}${month.slice(1)} ${format(date, 'yyyy')}`
}

/**
 * Cashflow (`/cashflow`) — the owner/admin treasury surface in the Finanzas
 * group. It overlays the projection engine (`projectCashflow`) on the canonical
 * cobros/pagos actuals (`useReceivables` / `usePayments`) plus the treasury
 * register (`useTreasury`) to render a rolling 13-week cash projection. Two tabs:
 * Proyección (KPIs + running-balance chart + 13-week matrix + cash-crunch) and
 * Compromisos (the committed-items register). The window is anchored on the
 * account's opening-balance date (week 0 is the ISO week containing it), so the
 * carry-forward starts exactly at the reconciled opening figure. ARS-only (v1).
 */
export function CashflowPage() {
  const {
    account,
    accounts,
    commitments,
    movements,
    addCommitment,
    addAccount,
    isFetching,
    isError,
    refetch,
  } = useTreasury()
  // FIVE fetches feed this page, not one. `receivables` and `payments` are as load-bearing as
  // `accounts` — they ARE the projected inflows and outflows — and both stores collapse to `[]`
  // on failure. Reading their rows while ignoring their flags is what let a `/receivables` 500
  // render a confident 13-week curve with zero inflows, on a page that is otherwise careful.
  // The outstanding payouts and the roster join them below, for the same reason.
  const {
    receivables,
    createReceivable,
    isLoading: receivablesLoading,
    isError: receivablesError,
    refetch: refetchReceivables,
  } = useReceivables()
  const {
    payments,
    createPayment,
    isLoading: paymentsLoading,
    isError: paymentsError,
    refetch: refetchPayments,
  } = usePayments()
  // The FOURTH fetch. Payroll is not a `Payment`, so nothing else on this page knows
  // about it — and it is usually the largest thing the studio owes. Its flags join the
  // page's below rather than being read for rows alone: a Posición missing payroll
  // OVERSTATES what the studio has, which is the one direction that gets someone hurt.
  const {
    data: outstandingPayouts,
    isLoading: payoutsLoading,
    isError: payoutsError,
    refetch: refetchPayouts,
  } = useQuery({
    queryKey: queryKeys.payouts.outstanding(),
    queryFn: fetchOutstandingPayouts,
  })
  // Names come from the roster `TeamDataProvider` already holds, so no fifth fetch.
  //
  // `pendingPayoutRows` degrades honestly without it — a roster outage costs the LABEL and
  // never the amount — but the roster is still a store this screen READS, and the page
  // already fails as a unit for the other four. Gating on it too is the consistent answer
  // and the one SE001 encodes: an empty array is a number, not an error, and deciding
  // per-store which emptiness is "safe" is how a screen ends up confidently wrong.
  // `isError` here is the ROSTER's own flag; the provider tracks its payout and assignment
  // fetches separately, and neither of those feeds this page.
  const { members, isLoading: rosterLoading, isError: rosterError, refetch: refetchRoster } = useTeamData()
  const payoutRows = useMemo(
    () =>
      pendingPayoutRows(
        outstandingPayouts ?? [],
        Object.fromEntries(members.map((m) => [m.id, m.name])),
      ),
    [outstandingPayouts, members],
  )

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState('posicion')
  const [lane, setLane] = useState<Currency>('ARS')
  const [commitmentOpen, setCommitmentOpen] = useState(false)
  const [cobroOpen, setCobroOpen] = useState(false)
  const [pagoOpen, setPagoOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)

  // The period a cobro/pago created from here belongs to: the month it is being created IN.
  // Both dialogs render it in their description, so the month is stated rather than assumed.
  //
  // This used to carry a caveat — the record was stamped with the real month while /cobros
  // and /pagos could only show Apr–Jun 2026, so it persisted correctly and was invisible on
  // the surface that owns it. Those selectors derive their months now (`lib/periods.ts`), so
  // the record is listed where the operator expects it.
  const launcherPeriod = currentPeriod()

  // The rule lives in `treasury-position.ts` so it can be unit-tested: inside this
  // component nothing could fail it. A lane opens on a live cobro or pago, not only on a
  // balance: the projection is lane-scoped, so a lane the selector omits has its money in
  // no projection at all.
  const lanes = useMemo<Currency[]>(
    () => projectionLanes(accounts, commitments, [...receivables, ...payments]),
    [accounts, commitments, receivables, payments],
  )

  // Keep the selected lane valid if the available set changes (e.g. an account edit
  // removes the last USD balance). Falls back to ARS.
  const activeLane = lanes.includes(lane) ? lane : 'ARS'

  // The projection's opening balance is the operating Saldos total of the selected
  // lane (the Posición's cash on hand), so the snapshot and the forward projection
  // share one source of truth. The reserve / FIMA accounts are wealth, not operating
  // cash, so they are excluded from the projection opening; the as-of date stays the
  // anchor.
  const laneAccount = useMemo(
    () => ({ ...account, openingBalance: laneAmount(saldosByLane(accounts), activeLane) }),
    [account, accounts, activeLane],
  )

  const positionModel = useMemo(
    () =>
      buildPositionModel({
        accounts,
        receivables,
        payments,
        commitments,
        asOfISO: account.openingBalanceDate,
        // Provenance for the Saldos rows, NOT an addend: these movements are already
        // applied to the account balances the section sums.
        movements,
        payouts: payoutRows,
      }),
    [accounts, receivables, payments, commitments, account.openingBalanceDate, movements, payoutRows],
  )

  const weeks = useMemo(
    () =>
      projectCashflow({
        account: laneAccount,
        receivables,
        payments,
        commitments,
        asOf: account.openingBalanceDate,
        currency: activeLane,
      }),
    [laneAccount, receivables, payments, commitments, account.openingBalanceDate, activeLane],
  )

  // Plan-only projection (register without actuals) for the reconciliation tab.
  const planWeeks = useMemo(
    () =>
      projectCashflow({
        account: laneAccount,
        receivables: [],
        payments: [],
        commitments,
        asOf: account.openingBalanceDate,
        currency: activeLane,
      }),
    [laneAccount, commitments, account.openingBalanceDate, activeLane],
  )
  const todayISO = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])
  const reconRows = useMemo(
    () => reconciliationRows(weeks, planWeeks, todayISO),
    [weeks, planWeeks, todayISO],
  )
  const reconSummary = useMemo(() => reconciliationSummary(reconRows), [reconRows])

  const windowHint =
    weeks.length > 0
      ? `${weeks.length} semanas desde ${formatAnchorDate(weeks[0].weekStart)}`
      : undefined

  // One launcher, four things it can add. The header used to carry four separate controls,
  // three of which NAVIGATED AWAY — to /settings, /cobros and /pagos — which is how this
  // page ended up with zero editable inputs on Posición, Proyección and Conciliación
  // (2026-07-30 action audit). Every entry now opens its dialog in place, so the treasury
  // surface is somewhere you can actually load the month.
  //
  // It is also the ONLY way to add a commitment here: the Compromisos register deliberately
  // carries no add button of its own (it used to, which put the same action on screen
  // twice). This action renders outside the <Tabs>, which is what lets it serve every tab
  // and the empty register alike — so if it is ever removed or made tab-conditional,
  // `cashflow-register.tsx` loses its create path entirely.
  const headerActions: PageHeaderAction[] = [
    {
      key: 'add',
      label: 'Agregar',
      icon: AFFORDANCE.create,
      variant: 'solid',
      color: 'primary',
      leadingIcon: true,
      primary: true,
      mobileIconOnly: true,
      // The items name the ENTITY, not the verb: "Agregar > Compromiso" reads once,
      // where four labelled verbs in a row read four times.
      items: [
        { key: 'commitment', label: 'Compromiso', icon: ICON.commitment, onSelect: () => setCommitmentOpen(true) },
        { key: 'cobro', label: 'Cobro', icon: ICON.invoice, onSelect: () => setCobroOpen(true) },
        { key: 'pago', label: 'Pago', icon: ICON.payment, onSelect: () => setPagoOpen(true) },
        { key: 'account', label: 'Cuenta', icon: ICON.bankDetails, onSelect: () => setAccountOpen(true) },
      ],
    },
    {
      key: 'accounts',
      label: 'Gestionar cuentas',
      icon: ICON.settings,
      iconOnly: true,
      // Still here, and still a navigation: MANAGING the existing accounts (editing
      // balances, the reserve flag, the position date) is a different job from adding
      // one, and it lives in Configuración. Adding is what moved into the launcher.
      onClick: () =>
        navigate(
          buildTrailHref('/settings?section=cashflow', { label: 'Cashflow', to: '/cashflow' }, searchParams),
        ),
    },
  ]

  // Loading FIRST, then error — the same order billing/reports and cobranza use, and it
  // matters: react-query keeps `isError` true THROUGH a refetch, so testing error first
  // would leave the error screen frozen on "Reintentar" and the button would look inert.
  //
  // And the error branch takes the whole page, not a corner of it. Every figure here hangs off
  // these fetches: with an empty array the opening balance derives to $0, the 13-week
  // projection carries forward from zero with no inflows, and the cash-crunch alert fires off
  // that. Rendering it anyway would have the owner plan payroll against a number the backend
  // never returned. A wrong money projection is worse than none.
  //
  // ANY of the five failing means a figure here is wrong, so the page fails as a unit — and
  // "Reintentar" retries all five, because retrying only the store the reader cannot name is
  // how a retry button ends up inert.
  const loading =
    isFetching || receivablesLoading || paymentsLoading || payoutsLoading || rosterLoading
  const failed = isError || receivablesError || paymentsError || payoutsError || rosterError
  const retryAll = () => {
    refetch()
    refetchReceivables()
    refetchPayments()
    refetchPayouts()
    refetchRoster()
  }

  // The launcher's dialogs, rendered in EVERY branch. They belong outside the success
  // return: the header carries the launcher on the loading and error screens too, and a
  // menu whose entries open nothing is worse than no menu. They also survive a failed
  // page: each fetches its own options and writes through its own mutation, so none of
  // them depends on the three reads that put this page into its error state — and before
  // the launcher existed, Registrar cobro / Registrar pago worked from here by navigating
  // away, so losing that on the error screen would have been a regression.
  const launcherDialogs = (
    <>
      {commitmentOpen ? (
        <CashflowCommitmentDialog
          onCreate={addCommitment}
          onClose={() => setCommitmentOpen(false)}
        />
      ) : null}

      {cobroOpen ? (
        <CobrosCreateCobroDialog
          period={launcherPeriod}
          onCreate={async (input) => {
            await createReceivable(input)
          }}
          onClose={() => setCobroOpen(false)}
        />
      ) : null}

      {pagoOpen ? (
        <PagosCreatePagoDialog
          period={launcherPeriod}
          onCreate={async (input) => {
            await createPayment(input)
          }}
          onClose={() => setPagoOpen(false)}
        />
      ) : null}

      {accountOpen ? (
        <CashflowAccountDialog onCreate={addAccount} onClose={() => setAccountOpen(false)} />
      ) : null}
    </>
  )

  if (loading) {
    return (
      <TooltipProvider>
        <PageHeader eyebrow="Hold" eyebrowHidden title="Cashflow" actions={headerActions} />
        <PageContent>
          <CashflowLoading />
        </PageContent>
        {launcherDialogs}
      </TooltipProvider>
    )
  }

  if (failed) {
    return (
      <TooltipProvider>
        <PageHeader eyebrow="Hold" eyebrowHidden title="Cashflow" actions={headerActions} />
        <PageContent>
          <CashflowError onRetry={retryAll} />
        </PageContent>
        {launcherDialogs}
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <PageHeader
        eyebrow="Hold"
        eyebrowHidden
        title="Cashflow"
        subtitle={windowHint ? { variant: 'period', value: windowHint } : undefined}
        actions={headerActions}
      />
      <PageContent>
        <Tabs value={tab} onValueChange={setTab} className="gap-6">
          <TabsList variant="segmented" className="ml-4 md:ml-8 self-start">
            <TabsTrigger variant="segmented" value="posicion">
              Posición
            </TabsTrigger>
            <TabsTrigger variant="segmented" value="proyeccion">
              Proyección
            </TabsTrigger>
            <TabsTrigger variant="segmented" value="conciliacion">
              Conciliación
            </TabsTrigger>
            <TabsTrigger variant="segmented" value="compromisos">
              Compromisos
            </TabsTrigger>
          </TabsList>
          <TabsContent value="posicion">
            <CashflowPosition model={positionModel} />
          </TabsContent>
          <TabsContent value="proyeccion">
            <CashflowProjection
              weeks={weeks}
              lane={activeLane}
              lanes={lanes}
              onLaneChange={setLane}
            />
          </TabsContent>
          <TabsContent value="conciliacion">
            <CashflowReconciliation
              rows={reconRows}
              summary={reconSummary}
              lane={activeLane}
              lanes={lanes}
              onLaneChange={setLane}
            />
          </TabsContent>
          <TabsContent value="compromisos">
            <CashflowRegister />
          </TabsContent>
        </Tabs>
      </PageContent>

      {launcherDialogs}
    </TooltipProvider>
  )
}
