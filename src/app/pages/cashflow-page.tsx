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

function formatAnchorDate(iso: string): string {
  const date = parseISO(iso)
  const month = format(date, 'LLL', { locale: es })
  return `${format(date, 'd', { locale: es })} de ${month.charAt(0).toUpperCase()}${month.slice(1)} ${format(date, 'yyyy')}`
}

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
  const {
    data: outstandingPayouts,
    isLoading: payoutsLoading,
    isError: payoutsError,
    refetch: refetchPayouts,
  } = useQuery({
    queryKey: queryKeys.payouts.outstanding(),
    queryFn: fetchOutstandingPayouts,
  })
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

  const launcherPeriod = currentPeriod()

  const lanes = useMemo<Currency[]>(
    () => projectionLanes(accounts, commitments, [...receivables, ...payments]),
    [accounts, commitments, receivables, payments],
  )

  const activeLane = lanes.includes(lane) ? lane : 'ARS'

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
      onClick: () =>
        navigate(
          buildTrailHref('/settings?section=cashflow', { label: 'Cashflow', to: '/cashflow' }, searchParams),
        ),
    },
  ]

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
