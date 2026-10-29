import { recentPeriods, toMonthId } from '@/app/lib/periods'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  defaultMonthId,
  type ChecklistItemId,
  type FixedExpense,
  type MonthId,
  type MonthlyOperationData,
  type MonthRecord,
  type MonthStatus,
  type MoInvoiceStatus,
  type ProductionRecord,
  type BankData,
  type AlertStatus,
} from './monthly-operation-mock-data'
import {
  closeBlockers,
  isLocked,
  serverBlockerLabel,
  summarize,
  type CloseBlocker,
  type MonthlySummary,
} from './monthly-operation-format'
import { useQueryClient } from '@tanstack/react-query'

import { queryKeys } from '@/queries/keys'
import { toast } from '@/app/components/components'
import { useReceivables } from './receivables-data'
import { monthPeriod } from './monthly-operation-finance-bridge'
import { nextReceivablesWatch } from './monthly-operation-receivables-watch'
import { productionPayload } from './production-payload'
import { ApiError } from '@/api/client'
import { monthlyApi, type CloseBlockerDto } from '@/api/monthly'
import { payoutsApi } from '@/api/payouts'
import { receivablesApi } from '@/api/receivables'
import { dtoToReceivable } from './receivables-api-data'
import { bundleToMonthData } from './monthly-operation-api-data'

const INVOICE_STATUS_ORDER: Record<MoInvoiceStatus, number> = {
  not_issued: 0,
  issued: 1,
  sent: 2,
  paid: 3,
}
const INVOICE_BLOCKED_MESSAGE: Record<MoInvoiceStatus, string> = {
  not_issued: 'La factura todavía no fue emitida',
  issued: 'La factura ya fue emitida',
  sent: 'La factura ya fue enviada',
  paid: 'La factura ya fue cobrada',
}

export type ClientExtraInput = { description: string; amount: number; billable: boolean }
export type AdjustmentInput = { description: string; amount: number }
export type ProductionInput = {
  date: string
  clientId: string
  clientName: string
  title: string
  type: string
  responsible: string
  participants: string[]
  hours: number
  viatics: number
  totalCost: number
  billAmount: number
  billable: ProductionRecord['billable']
  notes: string
  clientServiceId: string | null
  accountManagerId: string | null
  creatorId: string | null
  costEdited: boolean
  viaticsPaidAt: string
  receipt: string
}
export type ExpenseInput = Omit<FixedExpense, 'id'>

export type LoadStatus = 'loading' | 'ready' | 'error'

type LoadMode = 'initial' | 'refresh'

const RECEIVABLES_REFRESH_DELAY_MS = 250

export type MonthlyOperationContextValue = {
  months: MonthRecord[]
  selectedMonthId: MonthId
  selectMonth: (id: MonthId) => void
  month: MonthRecord
  data: MonthlyOperationData
  status: MonthStatus
  loadStatus: LoadStatus
  retry: () => void
  revalidate: (id: MonthId) => void
  locked: boolean
  summary: MonthlySummary
  blockers: CloseBlocker[]
  closeMonth: () => Promise<boolean>
  reopenMonth: () => Promise<boolean>
  setChecklistItem: (id: ChecklistItemId, value: boolean) => Promise<boolean>
  reviewClient: (receivableId: string) => Promise<boolean>
  registerClientPayment: (
    receivableId: string,
    amount: number,
    date: string,
    treasuryAccountId?: string,
  ) => Promise<boolean>
  setClientInvoiceStatus: (receivableId: string, status: MoInvoiceStatus) => void
  addClientExtra: (receivableId: string, input: ClientExtraInput) => Promise<boolean>
  setClientNote: (receivableId: string, note: string) => Promise<boolean>
  setClientEffectiveDate: (receivableId: string, date: string) => Promise<boolean>
  approveStatement: (payoutId: string) => Promise<boolean>
  dispatchStatement: (payoutId: string) => Promise<boolean>
  confirmStatement: (payoutId: string) => Promise<boolean>
  approveDraftStatements: () => Promise<{ approved: number; failed: number }>
  registerPayout: (
    payoutId: string,
    amount: number,
    date: string,
    treasuryAccountId?: string,
  ) => Promise<boolean>
  addAdjustment: (payoutId: string, input: AdjustmentInput) => Promise<boolean>
  setBankData: (payoutId: string, bank: BankData) => Promise<boolean>
  addProduction: (input: ProductionInput) => Promise<boolean>
  updateProduction: (id: string, input: ProductionInput) => Promise<boolean>
  deleteProduction: (id: string) => Promise<boolean>
  markViaticsPaid: (ids: string[], paidAt: string | null) => Promise<boolean>
  approveProductions: (ids: string[], approved: boolean) => Promise<boolean>
  addExpense: (input: ExpenseInput) => Promise<boolean>
  updateExpense: (id: string, input: ExpenseInput) => Promise<boolean>
  deleteExpense: (id: string) => Promise<boolean>
  setAlertStatus: (alertId: string, status: AlertStatus) => Promise<boolean>
}

function expensePayload(input: ExpenseInput) {
  return {
    concept: input.concept,
    category: input.category,
    amountMinor: minor(input.amount),
    recurrence: input.recurrence,
    ...(input.responsible ? { responsible: input.responsible } : {}),
    ...(input.monotributo ? { monotributo: input.monotributo } : {}),
    payStatus: input.payStatus,
    affectsProfitability: input.affectsProfitability,
    ...(input.notes ? { notes: input.notes } : {}),
  }
}

const MonthlyOperationContext = createContext<MonthlyOperationContextValue | null>(null)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const decapitalize = (text: string): string =>
  text.charAt(0).toLocaleLowerCase('es-AR') + text.slice(1)

function closeFailureMessage(error: unknown): string {
  const generic = 'No se pudo cerrar el mes'
  if (!(error instanceof ApiError)) return generic
  const details = isRecord(error.body) && isRecord(error.body.error) ? error.body.error.details : undefined
  const raw = isRecord(details) && Array.isArray(details.blockers) ? details.blockers : []
  const labels = raw
    .filter((blocker): blocker is { code: string; message: string } =>
      isRecord(blocker) && typeof blocker.code === 'string' && typeof blocker.message === 'string',
    )
    .map((blocker) => decapitalize(serverBlockerLabel(blocker)))
  return labels.length > 0 ? `${generic}: ${labels.join(', ')}` : generic
}

const minor = (major: number): string => String(Math.round(major * 100))
const EMPTY_DATA: MonthlyOperationData = {
  clients: [],
  team: [],
  paymentTotals: [],
  otherLanePaymentCount: 0,
  teamPaymentTotals: [],
  payments: [],
  productions: [],
  expenses: [],
  alerts: [],
  monotributo: [],
  checklist: {} as MonthlyOperationData['checklist'],
}
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
function monthLabel(period: MonthId): string {
  const [y, m] = period.split('-').map(Number)
  return `${MONTHS_ES[(m ?? 1) - 1]} ${y}`
}

function seedMonths(): MonthRecord[] {
  return recentPeriods().map(toMonthId).map((id) => ({
    id,
    label: monthLabel(id),
    status: 'draft' as MonthStatus,
    data: EMPTY_DATA,
  }))
}

export function MonthlyOperationProvider({ children }: { children: ReactNode }) {
  const [months, setMonths] = useState<MonthRecord[]>(() => seedMonths())
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [selectedMonthId, setSelectedMonthId] = useState<MonthId>(defaultMonthId())
  const { collectReceivable, applyReceivable, dataUpdatedAt: receivablesUpdatedAt } = useReceivables()
  const queryClient = useQueryClient()
  const versions = useRef<Map<string, number>>(new Map())
  const [invoiceOverride, setInvoiceOverride] = useState<Record<string, MoInvoiceStatus>>({})
  const [serverBlockers, setServerBlockers] = useState<CloseBlockerDto[]>([])
  const selectedPeriod = useRef<MonthId>(selectedMonthId)
  selectedPeriod.current = selectedMonthId
  const loadSeq = useRef<Map<MonthId, number>>(new Map())

  const hydrated = useRef<Set<MonthId>>(new Set())

  const loadBundle = useCallback(async (period: MonthId, mode: LoadMode = 'initial') => {
    const seq = (loadSeq.current.get(period) ?? 0) + 1
    loadSeq.current.set(period, seq)
    if (mode === 'initial') setLoadStatus('loading')
    const [bundleResult, blockersResult] = await Promise.allSettled([
      monthlyApi.getBundle(period),
      monthlyApi.getCloseBlockers(period),
    ])
    if (loadSeq.current.get(period) !== seq) return
    const onScreen = selectedPeriod.current === period
    if (onScreen) setServerBlockers(blockersResult.status === 'fulfilled' ? blockersResult.value : [])
    try {
      if (bundleResult.status === 'rejected') throw bundleResult.reason
      const bundle = bundleResult.value
      const data = bundleToMonthData(bundle)
      for (const row of [
        ...bundle.productions,
        ...bundle.expenses,
        ...bundle.alerts,
        ...bundle.payouts,
        ...bundle.receivables,
      ]) {
        versions.current.set(row.id, row.version)
      }
      setMonths((prev) => {
        const rec: MonthRecord = {
          id: period,
          label: monthLabel(period),
          status: bundle.status as MonthStatus,
          data,
        }
        return prev.some((m) => m.id === period) ? prev.map((m) => (m.id === period ? rec : m)) : [...prev, rec]
      })
      hydrated.current.add(period)
      if (onScreen) setLoadStatus('ready')
    } catch {
      if (mode === 'initial' && onScreen) setLoadStatus('error')
    }
  }, [])

  useEffect(() => {
    void loadBundle(selectedMonthId)
  }, [selectedMonthId, loadBundle])

  const receivablesWatch = useRef(0)
  useEffect(() => {
    const { seen, refresh: due } = nextReceivablesWatch(receivablesWatch.current, receivablesUpdatedAt)
    receivablesWatch.current = seen
    if (!due) return
    const timer = setTimeout(() => {
      void loadBundle(selectedMonthId, 'refresh')
      const pinned = defaultMonthId()
      if (pinned !== selectedMonthId) void loadBundle(pinned, 'refresh')
    }, RECEIVABLES_REFRESH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [receivablesUpdatedAt, selectedMonthId, loadBundle])

  const refresh = useCallback(() => loadBundle(selectedMonthId, 'refresh'), [loadBundle, selectedMonthId])

  const revalidate = useCallback(
    (id: MonthId) => {
      if (hydrated.current.has(id)) void loadBundle(id, 'refresh')
    },
    [loadBundle],
  )
  const retry = useCallback(() => {
    void loadBundle(selectedMonthId, 'initial')
  }, [loadBundle, selectedMonthId])
  const period = monthPeriod(selectedMonthId)
  const ver = (id: string): number => versions.current.get(id) ?? 0

  const rawMonth = useMemo(
    () => months.find((m) => m.id === selectedMonthId),
    [months, selectedMonthId],
  )
  const status: MonthStatus = rawMonth?.status ?? 'draft'
  const locked = isLocked(status)

  const value = useMemo<MonthlyOperationContextValue>(() => {
    const base = rawMonth ?? { id: selectedMonthId, label: monthLabel(selectedMonthId), status, data: EMPTY_DATA }
    const data: MonthlyOperationData = {
      ...base.data,
      clients: base.data.clients.map((c) => {
        const mark = invoiceOverride[c.id]
        return mark && INVOICE_STATUS_ORDER[mark] > INVOICE_STATUS_ORDER[c.invoiceStatus]
          ? { ...c, invoiceStatus: mark }
          : c
      }),
    }
    const month: MonthRecord = { ...base, data }

    const findRow = (receivableId: string) => {
      const row = data.clients.find((c) => c.id === receivableId)
      if (!row) throw new Error(`No receivable row ${receivableId} in ${selectedMonthId}`)
      return row
    }
    const findPayout = (payoutId: string) => {
      const payout = data.team.find((p) => p.id === payoutId)
      if (!payout) throw new Error(`No payout row for ${payoutId} in ${selectedMonthId}`)
      return payout
    }
    const guard = async (op: () => Promise<unknown>): Promise<boolean> => {
      try {
        await op()
        await refresh()
        return true
      } catch {
        toast.error('No se pudo guardar el cambio')
        return false
      }
    }
    const productionWrite = async (op: () => Promise<unknown>): Promise<boolean> => {
      const ok = await guard(op)
      if (ok) void queryClient.invalidateQueries({ queryKey: queryKeys.clients.productionsAll() })
      return ok
    }

    return {
      months,
      selectedMonthId,
      selectMonth: setSelectedMonthId,
      month,
      data,
      status,
      loadStatus,
      retry,
      revalidate,
      locked,
      summary: summarize(data),
      blockers: closeBlockers(data, serverBlockers),

      closeMonth: async () => {
        if (closeBlockers(data, serverBlockers).length > 0) {
          toast.error('Resolvé las validaciones pendientes antes de cerrar')
          return false
        }
        try {
          await monthlyApi.close(selectedMonthId)
          await refresh()
          return true
        } catch (error) {
          toast.error(closeFailureMessage(error))
          return false
        }
      },
      reopenMonth: () => guard(() => monthlyApi.reopen(selectedMonthId)),
      setChecklistItem: (id, checked) => guard(() => monthlyApi.setChecklist(selectedMonthId, id, checked)),

      reviewClient: (receivableId) =>
        guard(async () => {
          const c = findRow(receivableId)
          await receivablesApi.update(c.id, { reviewStatus: 'reviewed' })
        }),
      registerClientPayment: (receivableId, amount, date, treasuryAccountId) =>
        guard(async () => {
          const c = findRow(receivableId)
          await collectReceivable(c.id, amount, date, treasuryAccountId)
        }),
      setClientInvoiceStatus: (receivableId, invoiceStatus) => {
        const current = data.clients.find((c) => c.id === receivableId)?.invoiceStatus
        if (current && INVOICE_STATUS_ORDER[invoiceStatus] <= INVOICE_STATUS_ORDER[current]) {
          toast.warning(INVOICE_BLOCKED_MESSAGE[current])
          return
        }
        setInvoiceOverride((prev) => ({ ...prev, [receivableId]: invoiceStatus }))
      },
      addClientExtra: (receivableId, input) =>
        guard(async () => {
          const c = findRow(receivableId)
          const extras = [
            ...c.extras.map((e) => ({
              id: e.id,
              description: e.description,
              amountMinor: minor(e.amount),
              billable: e.billable,
            })),
            { description: input.description, amountMinor: minor(input.amount), billable: input.billable },
          ]
          const extraAmountMinor = String(
            extras.filter((e) => e.billable).reduce((s, e) => s + Number(e.amountMinor), 0),
          )
          applyReceivable(dtoToReceivable(await receivablesApi.update(c.id, { extras, extraAmountMinor })))
        }),
      setClientNote: (receivableId, note) =>
        guard(async () => {
          const c = findRow(receivableId)
          applyReceivable(dtoToReceivable(await receivablesApi.update(c.id, { planNotes: note })))
        }),
      setClientEffectiveDate: (receivableId, date) =>
        guard(async () => {
          const c = findRow(receivableId)
          applyReceivable(dtoToReceivable(await receivablesApi.update(c.id, { effectiveDate: date })))
        }),

      approveStatement: (payoutId) => guard(() => payoutsApi.approve(payoutId)),
      dispatchStatement: (payoutId) => guard(() => payoutsApi.dispatch(payoutId)),
      confirmStatement: (payoutId) => guard(() => payoutsApi.confirm(payoutId)),
      approveDraftStatements: async () => {
        const drafts = data.team.filter((p) => p.statementStatus === 'draft')
        let approved = 0
        for (const payout of drafts) {
          try {
            await payoutsApi.approve(payout.id)
            approved += 1
          } catch {
          }
        }
        if (approved > 0) await refresh()
        return { approved, failed: drafts.length - approved }
      },
      registerPayout: (payoutId, amount, date, treasuryAccountId) =>
        guard(async () => {
          await payoutsApi.register(payoutId, minor(amount), crypto.randomUUID(), date, treasuryAccountId)
          queryClient.invalidateQueries({ queryKey: queryKeys.treasury.all })
          queryClient.invalidateQueries({ queryKey: queryKeys.payouts.outstanding() })
        }),
      addAdjustment: (payoutId, input) =>
        guard(() =>
          payoutsApi.addAdjustment(payoutId, {
            description: input.description,
            amountMinor: minor(input.amount),
          }),
        ),
      setBankData: (payoutId, bank) =>
        guard(async () => {
          const p = findPayout(payoutId)
          await payoutsApi.upsert({ teamMemberId: p.memberId, period, bankProfile: bank })
        }),

      addProduction: (input) =>
        productionWrite(() => monthlyApi.createProduction(selectedMonthId, productionPayload(input))),
      updateProduction: (id, input) =>
        productionWrite(() => monthlyApi.updateProduction(id, { ...productionPayload(input), version: ver(id) })),
      deleteProduction: (id) => productionWrite(() => monthlyApi.deleteProduction(id, ver(id))),
      markViaticsPaid: (ids, paidAt) => productionWrite(() => monthlyApi.markViaticsPaid(ids, paidAt)),
      approveProductions: (ids, approved) =>
        productionWrite(() => monthlyApi.setProductionApproval(ids, approved)),

      addExpense: (input) => guard(() => monthlyApi.createExpense(selectedMonthId, expensePayload(input))),
      updateExpense: (id, input) =>
        guard(() => monthlyApi.updateExpense(id, { ...expensePayload(input), version: ver(id) })),
      deleteExpense: (id) => guard(() => monthlyApi.deleteExpense(id, ver(id))),
      setAlertStatus: (alertId, alertStatus) =>
        guard(() => monthlyApi.updateAlert(alertId, { version: ver(alertId), status: alertStatus })),
    }
  }, [
    months,
    rawMonth,
    selectedMonthId,
    status,
    loadStatus,
    retry,
    locked,
    collectReceivable,
    applyReceivable,
    refresh,
    revalidate,
    period,
    invoiceOverride,
    serverBlockers,
    queryClient,
  ])

  return <MonthlyOperationContext.Provider value={value}>{children}</MonthlyOperationContext.Provider>
}

export function useMonthlyOperation(): MonthlyOperationContextValue {
  const value = useContext(MonthlyOperationContext)
  if (!value) throw new Error('useMonthlyOperation must be used within a MonthlyOperationProvider')
  return value
}

export function useRevalidateOnOpen(id: MonthId): void {
  const { revalidate } = useMonthlyOperation()
  const opened = useRef(id)
  useEffect(() => {
    revalidate(opened.current)
  }, [revalidate])
}
