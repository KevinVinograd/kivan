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

// ── Invoice lifecycle ────────────────────────────────────────────────────────
/** The invoice lifecycle is monotonic: a status may only ever move forward. */
const INVOICE_STATUS_ORDER: Record<MoInvoiceStatus, number> = {
  not_issued: 0,
  issued: 1,
  sent: 2,
  paid: 3,
}
/** Why a transition was refused, keyed by the status the invoice is ALREADY in — that is what
 *  blocks it, and it is the only phrasing that stays true for every refused target. */
const INVOICE_BLOCKED_MESSAGE: Record<MoInvoiceStatus, string> = {
  not_issued: 'La factura todavía no fue emitida',
  issued: 'La factura ya fue emitida',
  sent: 'La factura ya fue enviada',
  paid: 'La factura ya fue cobrada',
}

// ── Mutation input shapes ────────────────────────────────────────────────────
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
  /** The client's per-production service it is billed under, or null. */
  clientServiceId: string | null
  accountManagerId: string | null
  /** The content creator; their hours × rate is what the production costs. */
  creatorId: string | null
  /** True once the operator typed the cost. Until then the API prices it from the
   *  creator's hourly rate, and re-prices it when the hours change. */
  costEdited: boolean
  /** YYYY-MM-DD the viático was paid back, or '' while it is owed. */
  viaticsPaidAt: string
  receipt: string
}
export type ExpenseInput = Omit<FixedExpense, 'id'>

/**
 * The state of the BUNDLE FETCH. Distinct from `status: MonthStatus`, which is the
 * month's lifecycle (draft / closed) and says nothing about whether it loaded.
 */
export type LoadStatus = 'loading' | 'ready' | 'error'

/**
 * 'initial' — mount, month change, or an explicit retry: the month is not on screen yet,
 * so the fetch owns the page's load state.
 * 'refresh' — a reload after a mutation already persisted: the month IS on screen, so the
 * fetch must not flip it to loading (a skeleton flash) or to error (a false "not saved").
 */
type LoadMode = 'initial' | 'refresh'

/** How long a burst of receivables-cache writes is coalesced into one bundle re-read. */
const RECEIVABLES_REFRESH_DELAY_MS = 250

export type MonthlyOperationContextValue = {
  months: MonthRecord[]
  selectedMonthId: MonthId
  selectMonth: (id: MonthId) => void
  month: MonthRecord
  data: MonthlyOperationData
  /** The month's lifecycle (draft / closed), NOT the fetch. See `loadStatus`. */
  status: MonthStatus
  /** The bundle fetch's outcome. Pages render loading / error + retry from this. */
  loadStatus: LoadStatus
  retry: () => void
  /**
   * Re-read a month this store already holds, with no skeleton. Meant for a surface that
   * shows the month and has just opened: call `useRevalidateOnOpen`, not this.
   */
  revalidate: (id: MonthId) => void
  locked: boolean
  summary: MonthlySummary
  blockers: CloseBlocker[]
  /**
   * Every PERSISTING action resolves to `true` only when the backend confirmed the write.
   * They never reject — the failure is already surfaced as a toast — so a caller that
   * ignores the returned boolean silently treats a failed write as a successful one.
   * Render the success toast, and close the dialog, only on `true`.
   *
   * The one action still typed `void` (`setClientInvoiceStatus`) persists NOTHING: no
   * endpoint exists for it, so it writes a session-only override that the next reload
   * wipes. It returns no boolean because there is no outcome to report — and for the
   * same reason its callers must not claim success.
   */
  // Lifecycle
  closeMonth: () => Promise<boolean>
  reopenMonth: () => Promise<boolean>
  setChecklistItem: (id: ChecklistItemId, value: boolean) => Promise<boolean>
  /**
   * Clients.
   *
   * Every one of these is keyed on the RECEIVABLE id, not the client id. `data.clients` is
   * one row per receivable (`bundle.receivables.map(clientFromReceivable)`), and two cobros
   * for one client in one month are a supported, legitimate shape: the generator blocks only
   * a second `monthly_fee` row, and hand-made duplicates are expected. Keyed on
   * `clientId`, the lookup was `Array.find`, which returns the FIRST of those rows: the
   * operator repaired the cobro missing its date and the money landed on the other one,
   * leaving the close blocker she was clearing still on screen.
   */
  reviewClient: (receivableId: string) => Promise<boolean>
  /** `treasuryAccountId` is where the cash landed — naming one moves that account's
   *  balance server-side, in the same transaction. */
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
  // Team — the statement lifecycle (draft → approved → dispatched → confirmed).
  // One action per transition rather than one "advance" action: each maps to its own
  // route, and naming them apart keeps an illegal jump from being expressible.
  approveStatement: (payoutId: string) => Promise<boolean>
  dispatchStatement: (payoutId: string) => Promise<boolean>
  confirmStatement: (payoutId: string) => Promise<boolean>
  /**
   * Approve every statement still in `draft`, one at a time, and report the tally.
   * Sequential because each write is followed by a single reload at the end, and
   * concurrent approvals would race that reload; partial results are reported rather
   * than collapsed into one success, since "5 de 7" is the truth the user must act on.
   */
  approveDraftStatements: () => Promise<{ approved: number; failed: number }>
  registerPayout: (
    payoutId: string,
    amount: number,
    date: string,
    treasuryAccountId?: string,
  ) => Promise<boolean>
  addAdjustment: (payoutId: string, input: AdjustmentInput) => Promise<boolean>
  setBankData: (payoutId: string, bank: BankData) => Promise<boolean>
  // Productions
  addProduction: (input: ProductionInput) => Promise<boolean>
  updateProduction: (id: string, input: ProductionInput) => Promise<boolean>
  deleteProduction: (id: string) => Promise<boolean>
  /** Mark viáticos paid back on `paidAt` (YYYY-MM-DD) — or owed again with null. */
  markViaticsPaid: (ids: string[], paidAt: string | null) => Promise<boolean>
  /** Approve productions (true) or send them back to pending (false). */
  approveProductions: (ids: string[], approved: boolean) => Promise<boolean>
  // Expenses
  addExpense: (input: ExpenseInput) => Promise<boolean>
  updateExpense: (id: string, input: ExpenseInput) => Promise<boolean>
  deleteExpense: (id: string) => Promise<boolean>
  // Alerts
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

/**
 * Lowercase the FIRST letter only, so a label can be spliced mid-sentence. Lowercasing
 * the whole string would read "facturas con error de arca" — an acronym is not a word.
 */
const decapitalize = (text: string): string =>
  text.charAt(0).toLocaleLowerCase('es-AR') + text.slice(1)

/**
 * Why the close was refused, in the user's language. The server answers a failed
 * close with 409 + `{ error: { details: { blockers } } }` — the very list the UI is
 * supposed to have shown BEFORE the click. Reading it back turns the old silent
 * `catch { return false }` into a sentence naming what to go fix; an unparseable body
 * degrades to the generic line rather than inventing a reason.
 */
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

/** Placeholder records so the month switcher shows a range before each bundle loads. */
function seedMonths(): MonthRecord[] {
  // The SAME window every other period selector offers (lib/periods.ts), so the month
  // switcher here cannot drift from Cobros, Pagos, Facturación and Reportes again — four
  // separate answers to "which months exist" is how they all ended up stale together.
  return recentPeriods().map(toMonthId).map((id) => ({
    id,
    label: monthLabel(id),
    status: 'draft' as MonthStatus,
    data: EMPTY_DATA,
  }))
}

/**
 * Owns the monthly-operation dataset, now loaded from the real plan bundle
 * (`GET /months/:period/plan`) per selected month. Every plan mutation persists
 * through its endpoint and then reloads the bundle (single source of truth). The bundle is the sole
 * source of the actuals it carries (receivable.collectedAmount, payout.paidAmount) —
 * nothing is overlaid on top of it any more. It is therefore only as fresh as its last
 * read, so a cobro written on Cobros is picked up by re-reading the bundle (see the
 * receivables watcher below), not by projecting that store's rows onto these. Closing/reopening go through the real month lifecycle.
 */
export function MonthlyOperationProvider({ children }: { children: ReactNode }) {
  const [months, setMonths] = useState<MonthRecord[]>(() => seedMonths())
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [selectedMonthId, setSelectedMonthId] = useState<MonthId>(defaultMonthId())
  // `applyReceivable`: a cobro edited HERE goes straight to the receivables store too. These
  // writes used to reach only this store, so Cobros, Facturación and Clientes kept the old
  // total, and the next edit there sent the stale extras back and erased the new one.
  const { collectReceivable, applyReceivable, dataUpdatedAt: receivablesUpdatedAt } = useReceivables()
  const queryClient = useQueryClient()
  // Optimistic-concurrency versions of the updatable plan rows (from the last bundle).
  const versions = useRef<Map<string, number>>(new Map())
  // Session-only override for the one concept with no direct backend write: the
  // invoice status (billingStatus transitions server-side via generateInvoice, not a
  // plain set). Persists across reloads; resets on a full page load.
  const [invoiceOverride, setInvoiceOverride] = useState<Record<string, MoInvoiceStatus>>({})
  /**
   * What the SERVER will refuse to close on, fetched alongside the bundle. Kept apart
   * from the front's own validations because it is authoritative in a way they are
   * not: the close endpoint runs exactly these.
   */
  const [serverBlockers, setServerBlockers] = useState<CloseBlockerDto[]>([])
  /**
   * The period currently on screen. `loadBundle` is fire-and-forget — an in-flight read
   * cannot be cancelled — so it needs a way to tell, when its reply lands, whether the
   * user has moved on. Assigned during render rather than in an effect so it is already
   * correct for a response that resolves before effects run.
   */
  const selectedPeriod = useRef<MonthId>(selectedMonthId)
  selectedPeriod.current = selectedMonthId
  /**
   * How many reads of each period have been STARTED. Two reads of the same month can now
   * be in flight at once — `guard` re-reads after its own mutation while the receivables
   * watcher re-reads after the same write reaches that store — and they are not
   * guaranteed to resolve in order. Applied last-write-wins, an older reply would restore
   * a stale snapshot and roll `versions` back, so the next edit fails optimistic
   * concurrency and the operator is told "No se pudo guardar el cambio" over a row that
   * is fine.
   */
  const loadSeq = useRef<Map<MonthId, number>>(new Map())

  /**
   * Periods read successfully at least once. `revalidate` re-reads only these: a period not
   * read yet belongs to the mount / month-change load, and a page's mount effect runs BEFORE
   * this provider's (children first), so re-reading it there would race that first load.
   */
  const hydrated = useRef<Set<MonthId>>(new Set())

  const loadBundle = useCallback(async (period: MonthId, mode: LoadMode = 'initial') => {
    const seq = (loadSeq.current.get(period) ?? 0) + 1
    loadSeq.current.set(period, seq)
    if (mode === 'initial') setLoadStatus('loading')
    // The blockers ride alongside the bundle but must not be able to fail it: they
    // sharpen the close button, and losing them costs a less specific refusal — not a
    // month that cannot be read. `allSettled` keeps that failure local.
    const [bundleResult, blockersResult] = await Promise.allSettled([
      monthlyApi.getBundle(period),
      monthlyApi.getCloseBlockers(period),
    ])
    // CLEARED, not kept, when the fetch fails. Keeping the last known list looks more
    // conservative and is worse: this list disables the close button
    // (`monthly-close-dialog.tsx`), so a stale entry would block a month that closes fine
    // with no way for the user to override it. Cleared, the close is merely attempted —
    // and the server's 409 now names the blocker that refused it, so the authoritative
    // answer still reaches the user. It also means a period change cannot leak one
    // month's blockers into another.
    // Superseded by a newer read of the SAME period: discard this reply whole. It is not
    // merely redundant — applying it would overwrite fresher rows and roll `versions`
    // back to numbers the server has already moved past.
    if (loadSeq.current.get(period) !== seq) return
    /**
     * Whether this month is the one on screen. It gates ONLY the two writes that are
     * single-valued for the whole store — `loadStatus` and `serverBlockers` — because
     * those are what leak across months: a background re-read of September resolving
     * after a switch to August would flip August out of its skeleton and render it from
     * `EMPTY_DATA` ("Todavía no hay datos cargados para este mes", over a month that is
     * merely still loading), carrying September's close blockers with it.
     *
     * It must NOT gate `months` or `versions`. Those are keyed by period and cannot leak,
     * and the dashboards read `months` for `defaultMonthId()` regardless of what is
     * selected here. Gating them left the pinned month's record permanently unhydrated
     * whenever its load finished after a month switch — `loadStatus: 'ready'` over an
     * empty record, which `retry()` cannot clear because it re-reads the SELECTED month.
     */
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
      // Only an INITIAL load (mount, month change, retry) may put the page into the error
      // state. A 'refresh' runs after a mutation that already persisted: the month on
      // screen is stale, not absent, and `guard` reports the write failure itself. Flipping
      // the whole page to an error there would claim the save was lost when it was not.
      if (mode === 'initial' && onScreen) setLoadStatus('error')
    }
  }, [])

  useEffect(() => {
    void loadBundle(selectedMonthId)
  }, [selectedMonthId, loadBundle])

  /**
   * Re-read the bundle when the canonical receivables store changes.
   *
   * Without this, a cobro registered on `/cobros` is invisible here for the rest of the
   * session: that write goes through `ReceivablesProvider`, which reconciles its own
   * cache and nothing else, while this store only ever re-reads on mount, on a month
   * change, or after one of ITS own mutations. Reported from production — a client whose
   * cobro was collected and showed "Cobrado" on Cobros stayed listed on the dashboard as
   * "sin cobro registrado", and the only way out was a full page reload.
   *
   * Coalesced, for writes that reach the cache in sequence rather than in one batch — two
   * cobros registered back to back, or any flow that awaits between reconciles. A single
   * synchronous batch needs no help: `generateMonthlyFees` folds every created row in one
   * `forEach`, React renders that once, and the effect therefore observes one timestamp
   * however many cobros the run created. The decision itself lives in
   * `nextReceivablesWatch` so it can be tested.
   */
  const receivablesWatch = useRef(0)
  useEffect(() => {
    const { seen, refresh: due } = nextReceivablesWatch(receivablesWatch.current, receivablesUpdatedAt)
    receivablesWatch.current = seen
    if (!due) return
    // 'refresh', never 'initial': the month is already on screen, so this must not flash a
    // skeleton or claim the month failed to load if the re-read fails.
    const timer = setTimeout(() => {
      void loadBundle(selectedMonthId, 'refresh')
      // The dashboards are pinned to the CURRENT month, whatever is selected here. A user
      // who picked another month on /operacion-mensual and then registers a cobro on
      // /cobros would otherwise re-read only the month they are NOT looking at, and the
      // dashboard would keep the exact "sin cobro registrado" card this watcher exists to
      // clear. The pinned month's record hydrates even while off screen, because `months`
      // is keyed by period and is not gated on what is selected.
      const pinned = defaultMonthId()
      if (pinned !== selectedMonthId) void loadBundle(pinned, 'refresh')
    }, RECEIVABLES_REFRESH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [receivablesUpdatedAt, selectedMonthId, loadBundle])

  const refresh = useCallback(() => loadBundle(selectedMonthId, 'refresh'), [loadBundle, selectedMonthId])

  /**
   * This store re-reads on mount, on a month change and after its OWN writes, and nothing
   * else. So every write made elsewhere stayed invisible here until one of those happened:
   * a production loaded from a client's ficha or from Equipo, an approval from the ficha, a
   * payout registered on Pagos. Reported from production (22/10): a production loaded from
   * Clientes did not show on Operación mensual until another one was loaded THERE, which
   * re-read the month and brought both. Hence a surface that shows the month re-reads it
   * when it opens. 'refresh', so the month on screen stays put while the read is in
   * flight; overlapping reads of one period are already ordered by `loadSeq`.
   */
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
    // The bundle is the source of truth for actuals (receivable.collectedAmount and
    // payout.paidAmount are baked in); apply only the session-only overrides on top.
    const data: MonthlyOperationData = {
      ...base.data,
      // Only while it is AHEAD of the server: the lifecycle only moves forward, so a server
      // status that caught up (or passed it, e.g. a factura sent from Cobros) wins over a
      // session-only mark that would otherwise pin the row to the older state.
      clients: base.data.clients.map((c) => {
        const mark = invoiceOverride[c.id]
        return mark && INVOICE_STATUS_ORDER[mark] > INVOICE_STATUS_ORDER[c.invoiceStatus]
          ? { ...c, invoiceStatus: mark }
          : c
      }),
    }
    const month: MonthRecord = { ...base, data }

    /**
     * Resolve the row a mutation targets, or THROW. These used to return `undefined` and every
     * caller wrote `if (c) await …` — so a miss skipped the write, `guard` saw a promise that
     * resolved cleanly, and the success toast fired over a save that never happened. That is
     * the same lie as the un-awaited call, just reached by a different road: a no-op is not a
     * success. Throwing routes a miss into `guard`'s catch, where it belongs.
     */
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
    // Run a persisting mutation then reload the bundle; surface a failure once, and REPORT
    // it. Returning the outcome is what lets a caller tell a saved write from a lost one:
    // this helper deliberately does not rethrow (the error toast is already rendered here,
    // and a second one at each call site would double up), so a caller has no other way to
    // know. Swallowing the failure into `void` is what let every dialog toast success over
    // a write that never landed.
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
    // A production write also changes the client view's history, which this store does
    // not own: invalidated, not patched.
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
        // Owns its failure message, like `guard` does: the caller branches on the
        // boolean and toasts only the success. It used to return a bare `false` and
        // let the page render one generic line for two very different failures — the
        // month's own validations, and a server refusal the UI never displayed.
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
          // Every argument the dialog collects reaches the API. Dropping the date here
          // left the server stamping `collectedAt` with "now" while the dialog had asked
          // for a "Fecha de cobro" and reported success; the destination is forwarded the
          // same way so it cannot repeat that.
          await collectReceivable(c.id, amount, date, treasuryAccountId)
        }),
      setClientInvoiceStatus: (receivableId, invoiceStatus) => {
        // The single chokepoint every caller funnels through (row dropdown AND detail panel),
        // so the monotonicity guard lives here rather than being repeated — and forgotten — at
        // each call site. Walking the status backwards would rewrite a settled invoice.
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

      // The real lifecycle. What stood here was a session-only status flip that the next
      // reload wiped, mislabelled "Generar cuenta corriente" — while these three routes
      // sat unused and the server kept refusing the close on the statements they approve.
      approveStatement: (payoutId) => guard(() => payoutsApi.approve(payoutId)),
      dispatchStatement: (payoutId) => guard(() => payoutsApi.dispatch(payoutId)),
      confirmStatement: (payoutId) => guard(() => payoutsApi.confirm(payoutId)),
      approveDraftStatements: async () => {
        // Deliberately NOT `guard` per row: guard toasts each failure and reloads the
        // bundle after every write, so a roster of ten would stack ten toasts and ten
        // reloads. One reload at the end, one summary toast at the call site.
        const drafts = data.team.filter((p) => p.statementStatus === 'draft')
        let approved = 0
        for (const payout of drafts) {
          try {
            await payoutsApi.approve(payout.id)
            approved += 1
          } catch {
            // Counted, not swallowed: the tally is what the caller reports.
          }
        }
        if (approved > 0) await refresh()
        return { approved, failed: drafts.length - approved }
      },
      // The date is forwarded, not dropped. The dialog has always shown a "Fecha de pago"
      // picker; this signature discarded it, so every payout was dated by the moment of
      // data entry. Same defect the cobro carried until #132 — this was the last path.
      registerPayout: (payoutId, amount, date, treasuryAccountId) =>
        guard(async () => {
          await payoutsApi.register(payoutId, minor(amount), crypto.randomUUID(), date, treasuryAccountId)
          // The register moved a treasury balance and changed what payroll is still owed,
          // and NEITHER lives in this provider's `refresh()` — they live in react-query
          // caches this store does not own. `treasury-data` sets `refetchOnMount: false`
          // on purpose (its account anchor is client-only), so navigating to Cashflow does
          // NOT refetch: without this the Saldos figure keeps the pre-payout number until a
          // hard reload, which is the "balance that changed for invisible reasons" the
          // provenance line exists to prevent, running backwards.
          //
          // Same shape `receivables-data` and `payments-data` already use after a
          // settlement. Invalidated rather than patched: this store does not own either
          // cache.
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
      // The create and the edit send the SAME body — one mapper, so a field added to the form
      // cannot reach the backend on create and silently vanish on edit.
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
    // Stable for the app's lifetime (it comes from the provider), so listing it costs
    // nothing — and leaving it out is how a memo silently closes over a stale client.
    queryClient,
  ])

  return <MonthlyOperationContext.Provider value={value}>{children}</MonthlyOperationContext.Provider>
}

export function useMonthlyOperation(): MonthlyOperationContextValue {
  const value = useContext(MonthlyOperationContext)
  if (!value) throw new Error('useMonthlyOperation must be used within a MonthlyOperationProvider')
  return value
}

/**
 * Re-read `id` when the calling surface opens, if the store already holds it, so a page
 * opened after a write made elsewhere shows that write. Once per mount: a month switch
 * while the page is open is already re-read by the provider itself.
 */
export function useRevalidateOnOpen(id: MonthId): void {
  const { revalidate } = useMonthlyOperation()
  const opened = useRef(id)
  useEffect(() => {
    revalidate(opened.current)
  }, [revalidate])
}
