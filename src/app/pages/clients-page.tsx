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

// One filter source of truth feeds both the table (TanStack column filters) and
// the master-detail list (ClientListFilters), so the filter survives the view
// switch. The column ids align with ClientFilterId (COLUMN_IDS satisfies).
function toColumnFilters(filters: ClientListFilters): ColumnFiltersState {
  return Object.entries(filters)
    .filter(([, value]) => value != null && value !== '')
    .map(([id, value]) => ({ id, value }))
}

function fromColumnFilters(columnFilters: ColumnFiltersState): ClientListFilters {
  return Object.fromEntries(columnFilters.map((f) => [f.id, f.value as string])) as ClientListFilters
}

/**
 * Clients module (PRD). Vista tabla (toolbar + DataTable) switches to a
 * master-detail compact list + detail when a row is opened. Owns the client
 * dataset (local, mutated by the CRUD dialogs), the load-status machine and the
 * dialog state. Filtering/sorting/selection live inside the DataTable instance.
 */
export function ClientsPage() {
  const { role, capabilities, canDo } = useRole()
  // The signed-in employee's roster identity (`User.teamMemberId`). Anchors the
  // self-view — their assigned clients and their own work-log dialogs. Null when the
  // login isn't linked to a roster person, which fails the self-view closed (no
  // clients, no logging) rather than leaking someone else's work.
  const { me } = useAuth()
  const selfMemberId = me?.teamMemberId ?? null
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [data, setData] = useState<Client[]>([])
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
  const [dialog, setDialog] = useState<ClientDialogState>({ kind: 'none' })
  // Action-dialog targets, kept off the CRUD `dialog` state: bulk Cambiar estado
  // (selected clients), row Agregar trabajo extra and Enviar cuenta corriente.
  const [changeStatusTarget, setChangeStatusTarget] = useState<Client[] | null>(null)
  const [sendStatementTarget, setSendStatementTarget] = useState<Client | null>(null)
  // Employee self-work-log dialog (client-prefilled, member fixed to the signed-in
  // employee). Opened from the employee-only Cargar column; never bills the client.
  const [clientTeamDialog, setClientTeamDialog] = useState<ClientTeamDialogState>({ kind: 'none' })
  // Page-owned list filters so a dashboard deep-link can seed them (e.g. risk).
  const [listFilters, setListFilters] = useState<ClientListFilters>({})

  // Derived risk band per client (default month — the table is month-agnostic),
  // reused by the table column, the list filter and the deep-link. Scoring needs the
  // real profitability/capacity aggregates, which need the `profitability` capability, so
  // the fetch is gated on it and a role without it simply has no risk to show.
  const riskPeriod = monthIdToPeriod(defaultMonthId())
  const canScoreRisk = hasCapability(capabilities, 'profitability')
  const riskProfitability = useReportsProfitability(riskPeriod, canScoreRisk)
  const riskCapacity = useReportsCapacity(canScoreRisk)
  // Risk is gated as a FEATURE, not as the page: the client list is fetched separately and
  // stays perfectly usable when only the aggregates fail. But a failed aggregate fetch
  // collapses to [] like every store here, and scoring an empty dataset would band every
  // client "saludable" — so on error the map is dropped entirely and the column says
  // "Sin datos". Failing the whole screen over an optional, hidden-by-default column would
  // punish the user for a column they may not even have open.
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
  // `null` means "we do not know", not "healthy". A missing entry covers every honest
  // reason we have no band — the role may not read the aggregates, they are still in
  // flight, the fetch failed, or the client was not scored — and the column renders
  // "Sin datos" for all of them rather than a reassuring green badge.
  const riskOf = useCallback(
    (client: Client): RiskLevel | null => riskMap.get(client.id) ?? null,
    [riskMap],
  )
  // Contextual back-trail accumulated in the URL (`?trail=`): every step the user
  // passed through to deep-link into a client here, so they can step back to any of
  // them. `trailToHere` collapses a loop back to this page so it never duplicates
  // the leaf and a round trip does not leave a misleading parent chain.
  const trail = trailToHere(searchParams, '/clients')

  // Seed the open client + risk filter from the deep-link (?open=&risk=).
  useEffect(() => {
    const open = searchParams.get('open')
    const risk = searchParams.get('risk')
    if (open) setSelectedId(open)
    if (risk) setListFilters((prev) => ({ ...prev, risk }))
  }, [searchParams])

  // Open the new-client dialog when arriving from the global "Nuevo" launcher
  // (?new), then strip the param so it fires once.
  useEffect(() => {
    if (!searchParams.has('new')) return
    // The Equipo may not create clients (`POST /clients` is owner/admin), and the launcher
    // never offers them the item — but the URL is reachable by hand. Ignore the param
    // rather than opening a dialog whose submit the API answers with a 403, mirroring the
    // same guard on /team.
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
  // Single selection source of truth (keyed by client id) shared by the table
  // and the master-detail list, so picks persist across the view switch.
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

  // Load the workspace's clients from the API; re-runs on retry (reloadKey bump).
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

  /**
   * Re-read the roster in place, without the loading state a retry shows. A priced line
   * changed a client's fee on the server, and the roster (and the detail built from it)
   * still held the old one: HOLD added a monthly service and "no impactó en el fee"
   * (review of 2026-10-21). A failed re-read leaves the previous rows, which is what the
   * screen showed a second ago, rather than blanking a page that loaded fine.
   */
  function refreshClients() {
    fetchClients()
      .then(setData)
      .catch(() => undefined)
  }

  const navigate = useNavigate()

  /**
   * The month's money comes from the CANONICAL receivables store, already mounted
   * above this page (`router.tsx`), so nothing is fetched or forked here — the client
   * row is the entity, the receivable is the money, and `withMonth` projects one onto
   * the other. Before this, `dtoToClient` hardcoded a payment status, a $0 collected
   * and the contracted fee as the amount due, on every successful fetch.
   */
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

  /**
   * Real per-client margin, from the profitability aggregate this page ALREADY fetches for
   * the risk column — no second request. Nothing set `profitabilityPercent` before, so with
   * real data it was always undefined and every margin surface (the Rentabilidad column,
   * the portfolio average KPI, the detail's P&L) read "No disponible". The status is left
   * to `resolveProfitabilityStatus`, which the module already derives from the percentage,
   * so one threshold governs. On a failed aggregate the map is empty and the surfaces go
   * back to saying nothing rather than implying a 0% margin.
   */
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

  /**
   * Open a money action on the client's cobro of the month.
   *
   * One cobro → straight to the dialog. Several (one per service, which the model allows
   * on purpose) → the picker, because posting money against a service nobody chose is
   * worse than one extra click. None → say so; the action has nothing to act on.
   */
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

  // CSV export for the header (full visible roster) and the bulk bars (current
  // selection). Profitability columns are owner-scoped, mirroring role-access.
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

  /**
   * Bulk facturar: generate a real comprobante for every uninvoiced receivable of the
   * selected clients, each through its own suggested emisor.
   *
   * It used to flip a fabricated `invoiceStatus` on the client row and announce N
   * facturas that nobody had issued. Now it opens a plan first — the confirmation names
   * how many will be issued, which emisor each uses, and how many are SKIPPED because
   * their emisor has a blocking alert (límite alcanzado / error de conexión). Issuing
   * against a maxed-out monotributo is the failure mode this bulk path can actually
   * cause, so it has to be visible before it runs, not reported afterwards.
   */
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

  /** Run the confirmed plan. Partial failure is reported honestly, mirroring the bulk
   *  status write below: `allSettled`, then say how many of how many landed. */
  async function runBulkInvoice(plan: BulkInvoicePlan) {
    setBulkInvoicePending(true)
    const results = await Promise.allSettled(
      plan.issuable.map(({ receivable, emitter }) => generateInvoice(receivable.id, emitter.id)),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    setBulkInvoicePending(false)
    if (ok === 0) {
      // Nothing landed: keep the plan on screen so Reintentar is one click, instead of
      // making the user re-select the clients and rebuild the same plan from scratch.
      toast.error('No se pudo generar ninguna factura')
      return
    }
    // At least one was issued, so the plan is now stale — those receivables have a
    // factura and would be filtered out of a fresh plan anyway.
    setBulkInvoiceState(null)
    if (ok < plan.issuable.length) {
      toast.warning(`Se generaron ${ok} de ${plan.issuable.length} facturas`)
      return
    }
    toast.success(ok === 1 ? '1 factura generada' : `${ok} facturas generadas`)
  }

  /**
   * Bulk Cambiar estado: apply the chosen status to the selected clients.
   *
   * `status` is a REAL API field, unlike most of what this row shows, so this write has to reach
   * the backend. It used to be `setData` + a success toast and nothing else: the owner marked a
   * client churned, saw "Estado actualizado", reloaded, and the client was active again.
   *
   * A bulk write can fail HALFWAY, which is the case worth getting right. `allSettled`, not
   * `all`: with `all` the first rejection abandons the rest, and the ones that DID persist would
   * be reported as failures. Only the ids the backend confirmed are updated locally, and the
   * toast counts them — a partial result is reported as partial, not rounded up to success or
   * down to failure.
   */
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

  /**
   * Agregar trabajo extra — an itemized extra on the month's cobro, which is exactly
   * what the API models (`Receivable.extras`, each `{description, amountMinor, billable}`
   * behind the `extraAmountMinor` aggregate).
   *
   * It used to add the amount to a fabricated `currentMonthDueAmount`, recompute a
   * fabricated payment status and append a line to the client's notes. The number moved,
   * the note was never saved either, and a reload erased both. Now the amount owed rises
   * because the receivable says so.
   */
  /** Issue ONE factura for real, through the emisor the confirmation named. */
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
      // The three money actions resolve to a real receivable before they open anything.
      onRegisterPayment: (client) => openMoney(client, 'collect', collectable, 'registrar un pago'),
      onIssueInvoice: (client) => openMoney(client, 'invoice', invoiceable, 'emitir una factura'),
      onSendStatement: (client) => setSendStatementTarget(client),
      onAddExtraWork: (client) => openMoney(client, 'extra', (rows) => rows, 'cargar un trabajo extra'),
      // "Deshabilitar" reuses the churn status change (sets the client inactive); the
      // Pausar row action was folded into it. Permanent removal is the delete dialog.
      onChurn: (client) => setDialog({ kind: 'confirm', client, action: 'churn' }),
      onDelete: (client) => setDialog({ kind: 'delete', client }),
      // Employee Cargar column: log the signed-in employee's OWN work against the
      // client, prefilled and member-fixed. Owner/admin never render this column, and
      // an unlinked login (no `selfMemberId`) can't open the dialog at all.
      onLogHours: (client) => {
        if (!selfMemberId) return
        setClientTeamDialog({ kind: 'hours', client, selfMemberId })
      },
      // Only a communication lead sees this (the grant gates the item), and a lead loads the
      // production of whoever SHOT it — so the creator starts empty, not as the lead.
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

  // The employee perspective is a read-only roster of their own assigned accounts;
  // owner/admin see every client. The SERVER already scopes `GET /clients` to the
  // employee's assignments (and returns none to an unlinked login), so the list is
  // trusted as is. It used to be filtered again by `client.assignedTeam`, which the API
  // mapping never fills (always []) — so every employee saw "Todavía no tenés clientes
  // asignados" however many clients they had. An unlinked login still sees nothing.
  const visibleClients = useMemo(
    () => (role === 'employee' ? (selfMemberId ? clients : []) : clients),
    [clients, role, selfMemberId],
  )

  function retry() {
    setReloadKey((key) => key + 1)
  }

  /**
   * Close the dialog a write came from — and ONLY that one.
   *
   * These handlers used to end with a bare `setDialog({ kind: 'none' })`, which closes
   * whatever is open at the moment the request resolves, not what was submitted. That is
   * the wrong dialog whenever the operator moved on while the request was still in
   * flight: cancel a slow "Crear cliente", open "Nuevo" again, start typing, and the
   * first response wipes the form out from under them. Cancelar being clickable during a
   * pending write is what makes that reachable in one gesture, so the guard has to land
   * with it.
   *
   * A stale response now closes nothing. The write still happened and still toasted — it
   * just no longer reaches across into a dialog it does not own.
   */
  function closeIfStillOpen(matches: (current: ClientDialogState) => boolean) {
    setDialog((current) => (matches(current) ? { kind: 'none' } : current))
  }

  async function submitClient(
    mode: 'new' | 'edit',
    values: ClientFormValues,
    client: Client | null,
  ) {
    if (mode === 'edit' && client) {
      // Persist via PUT /clients/:id, then merge the edited fields locally so the
      // row keeps its derived fields (payment status, team) that the DTO omits.
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

  /**
   * Register a collection against the month's real receivable.
   *
   * This used to be one `setData` over a fabricated balance: the money moved on screen,
   * nothing was posted, and a reload put it back. `collectReceivable` is atomic,
   * idempotent and ledger-posting, and it had been built and bypassed all along.
   */
  function confirmPayment(
    receivableId: string,
    amount: number,
    collectedAt: string,
    treasuryAccountId?: string,
  ) {
    // The rejection is deliberately NOT caught here. `CobrosRegistrarCobroDialog` owns
    // the feedback for both outcomes — it toasts and closes on success, and toasts the
    // failure while STAYING OPEN so the typed amount survives. Catching it here made the
    // promise resolve, so the dialog congratulated the user on a write that had 500'd:
    // two error handlers, and the wrong one won.
    // Every argument the dialog collects is threaded through. Declaring a parameter and
    // then not passing it is not a type error — it is how the "Fecha de cobro" typed in
    // Operación mensual was silently dropped for as long as it was, so each one is
    // forwarded explicitly rather than by arity.
    return collectReceivable(receivableId, amount, collectedAt, treasuryAccountId).then(
      () => undefined,
    )
  }

  /**
   * Deshabilitar (churn) / Pausar — the same real `status` field as the bulk action above, reached
   * from a single row's confirmation dialog. The row menu now offers only Deshabilitar (`churn`);
   * `pause` stays reachable from the bulk "Cambiar estado" path. The dialog STAYS OPEN when the
   * write fails: closing it on a failure destroys the user's decision while telling them it worked.
   */
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

  /**
   * Eliminar permanente — `DELETE /clients/:id`, the removal Deshabilitar is not.
   *
   * Same contract as `confirmAction`: the row is dropped locally only after the backend
   * confirms, and the dialog stays open on failure. A client that is open in the detail pane is
   * also deselected — leaving the detail mounted on a client the API no longer returns would
   * show a record that does not exist any more. Its bulk-selection key is dropped too, so the
   * deleted id cannot linger in `rowSelection` after the row that owned it is gone.
   */
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
      // The Equipo's empty roster means "nothing assigned to you", and they may not create
      // clients — so they get the message without the CTA the API would 403 anyway.
      role === 'employee' ? (
        <ClientsEmptyNoAssignments />
      ) : (
        <ClientsEmptyGeneral onNewClient={() => setDialog({ kind: 'new' })} />
      )
    ) : (
      <div className="flex flex-col gap-4 md:gap-6">
        {/* Portfolio summary row above the toolbar — owner/admin only; the
            employee sees a read-only roster of their own accounts (no summary).
            The gap between the KPI row and the toolbar is the page's card rhythm:
            16px on a phone, 24px from `md`. */}
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

  // The employee perspective is a read-only roster (no detail), so it never enters
  // the master-detail view even via an ?open= deep-link.
  const inDetail =
    role !== 'employee' && status === 'ready' && hasData && selectedId != null && selected != null

  // Contextual trail: only when the user arrived via a deep link that carried a
  // trail, so they can step back to any step. It renders in the overline slot above
  // the title — the PageHeader in table view, and the list panel's SectionHeader in
  // detail view (where the PageHeader is hidden).
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
                  // Send a role that can open the Rentabilidad tab straight to it; one that
                  // cannot falls back to the edit dialog rather than a tab it would bounce off.
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
          // Retry BOTH stores: the screen depends on the two, and refetching half of it
          // looks broken to the person who pressed the button.
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
          // The dialog opens a mail/WhatsApp draft — the OS takes it from there. We cannot
          // know it was actually sent, so we confirm what truly happened (a draft opened),
          // not a delivery we did not perform. Matches the honest `/cuentas-corrientes`
          // "simulado" wording and the silent Contactar-cliente handoff.
          onSent={() => toast.success('Borrador abierto en tu mail o WhatsApp')}
          onClose={() => setSendStatementTarget(null)}
        />
      ) : null}
    </TooltipProvider>
  )
}
