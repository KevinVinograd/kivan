import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { payoutsApi, type PayoutStatementDto } from '@/api/payouts'

import {
  fetchTeamMembers,
  createTeamMemberViaApi,
  updateTeamMemberViaApi,
  setTeamMemberStatusViaApi,
  deactivateTeamMemberViaApi,
  saveMemberBankViaApi,
  fetchTimeEntries,
  addTimeEntryViaApi,
  fetchMemberExpenses,
  fetchMemberExtras,
  addMemberExpenseViaApi,
  addMemberExtraViaApi,
  addMemberProductionViaApi,
  approveMemberExtrasViaApi,
} from './team-api-data'
import {
  fetchPeriodPlan,
  payoutsByMember,
  payoutToStatement,
  productionsToEntries,
} from './team-payout-api-data'
import {
  assignViaApi,
  endAssignmentViaApi,
  fetchAssignments,
  updateAssignmentViaApi,
} from './assignments-api-data'
import {
  activityEventsForMember,
  assignmentsForClient,
  assignmentsForMember,
  clientById,
  clientMonthlyLoad,
  clientsForMember,
  estimatedPayForMember,
  expectedHoursForMember,
  memberMonthlyClientLoad,
  membersForClient,
  expensesForMember,
  expensesTotalForMember,
  extrasForMember,
  tasksForMember,
  objectivesForMember,
  bankCompleteness,
  bankDetailsCompleteness,
  lastUpdatedForMember,
  loadStatusForMember,
  memberById,
  paymentHistoryForMember,
  pendingExtrasForMember,
  productionsForMember,
  productionsCountForMember,
  statementForMember,
  timeEntriesForMember,
  trackedHoursForMember,
  trackedHoursForMemberClient,
  currentTeamMonth,
  type ActivityEvent,
  type BankCompleteness,
  type Client,
  type ClientAssignment,
  type ClientLoadRow,
  type CompensationModel,
  type EmploymentType,
  type ExpenseEntry,
  type ExtraWorkEntry,
  type LoadStatus,
  type MemberObjective,
  type MemberTask,
  type MonthlyTeamStatement,
  type PendingExtras,
  type ProductionEntry,
  type TeamDataSnapshot,
  type TeamMember,
  type TeamMemberStatus,
  type TeamPaymentRecord,
  type TimeEntry,
} from './team-mock-data'
import {
  extrasDisplay,
  loadHoursLabel,
  loadPercent,
  memberAlerts,
  primaryAlert,
  teamInsightDisplay,
  teamMatchesFilters,
  teamSearchText,
  type MemberAlert,
  type TeamFilters,
  type TeamInsightAction,
} from './team-format'
import type { ProductionInput } from './monthly-operation-data'

// ── Mutation input shapes ────────────────────────────────────────────────────
/** Flat form model for the add/edit person dialog (PRD §9). */
export type TeamMemberFormValues = {
  firstName: string
  lastName: string
  email: string
  phone: string
  role: string
  status: TeamMemberStatus
  employmentType: EmploymentType
  paymentModel: CompensationModel
  monthlyAmount: number
  hourlyRate: number
  productionRate: number
  bankName: string
  accountHolder: string
  cbuOrCvu: string
  bankAlias: string
  taxId: string
  notes: string
  /** Whether this alta ALSO gives the person a login. Only meaningful when creating, and
   *  only offered to someone who may invite — the roster and the login are separate things
   *  on purpose (people get paid who never sign in), so this stays opt-in. */
  grantAccess: boolean
  accessRole: 'admin' | 'employee'
}

export type TimeEntryInput = {
  date: string
  clientId: string
  clientName: string
  taskType: string
  hours: number
  description: string
  isOutOfScope: boolean
}

export type ExpenseInput = {
  date: string
  clientId?: string
  clientName?: string
  concept: string
  amount: number
}

export type ExtraInput = {
  date: string
  clientId: string
  clientName: string
  description: string
  hours: number
  amount: number
}

/**
 * Input for assigning a member to a client.
 *
 * `serviceId` and not a free-text `service`: the backend stores a FK into the
 * `Service` catalog, so a typed label had nowhere to go and was dropped on the way
 * out. `clientName` is gone too — the server denormalizes it onto the row it
 * returns, so the caller no longer supplies a name the record already knows.
 */
export type AssignmentInput = {
  roleOnClient: string
  serviceId?: string
  estimatedMonthlyHours?: number
  /** What the studio pays for this member on this client per month, in major units.
   *  `0` is a real agreed amount; `undefined` means it was not entered. */
  monthlyCost?: number
}

/** Lifecycle of the roster fetch — never collapsed into "the roster is empty". */
type FetchStatus = 'loading' | 'ready' | 'error'

export type TeamDataContextValue = {
  members: TeamMember[]
  /** True while the roster fetch is in flight (initial load or a `refetch`). */
  isLoading: boolean
  /**
   * True when the roster fetch FAILED. Consumers must branch on this before reading
   * `members`: an empty roster under an error means "we could not load", not "there
   * is nobody on the team".
   */
  isError: boolean
  /**
   * True when the PAYOUT fetch failed. Tracked apart from `isError` because the two
   * outages are different sentences: an empty `payoutsByMemberId` under an error means
   * "we could not load the month's plan", not "nobody has one" — and rendering the
   * latter is the same class of lie as rendering rows over a failed fetch
   *.
   */
  isPayoutsError: boolean
  /**
   * True when the ASSIGNMENT fetch failed. Its own flag, like the payouts one: an
   * empty `clientAssignments` under an error means "we could not load who works on
   * what", and rendering that as "nobody is assigned" is a claim about the studio
   * made out of an outage.
   */
  isAssignmentsError: boolean
  /** Re-run the roster fetch — wire this to the consumer's "Reintentar" affordance. */
  refetch: () => void
  /**
   * Re-read every slice WITHOUT flipping it to loading, once the store has loaded. Meant for
   * a surface that shows this data and has just opened: call `useRevalidateTeamOnOpen`.
   */
  revalidate: () => void
  memberById: (id: string) => TeamMember | undefined
  // Reads (snapshot-bound)
  assignmentsForMember: (id: string) => ClientAssignment[]
  timeEntriesForMember: (id: string) => TimeEntry[]
  productionsForMember: (id: string) => ProductionEntry[]
  expensesForMember: (id: string) => ExpenseEntry[]
  extrasForMember: (id: string) => ExtraWorkEntry[]
  tasksForMember: (id: string) => MemberTask[]
  objectivesForMember: (id: string) => MemberObjective[]
  activityEventsForMember: (id: string) => ActivityEvent[]
  clientById: (clientId: string) => Client | undefined
  clientsForMember: (id: string) => string[]
  trackedHoursForMember: (id: string) => number
  trackedHoursForMemberClient: (id: string, clientId: string) => number
  expectedHoursForMember: (id: string) => number
  loadStatusForMember: (id: string) => LoadStatus | undefined
  loadPercent: (id: string) => number
  loadHoursLabel: (id: string) => string
  productionsCountForMember: (id: string) => number
  expensesTotalForMember: (id: string) => number
  pendingExtrasForMember: (id: string) => PendingExtras
  bankCompleteness: (member: TeamMember) => BankCompleteness
  statementForMember: (id: string) => MonthlyTeamStatement | undefined
  estimatedPayForMember: (id: string) => number
  paymentHistoryForMember: (id: string) => TeamPaymentRecord[]
  lastUpdatedForMember: (id: string) => string
  extrasDisplay: (id: string) => { label: string; amount?: string; pending: boolean }
  memberAlerts: (member: TeamMember) => MemberAlert[]
  primaryAlert: (member: TeamMember) => MemberAlert | null
  teamInsightDisplay: (member: TeamMember) => {
    headline: string
    action: TeamInsightAction
  }
  teamSearchText: (member: TeamMember) => string
  teamMatchesFilters: (member: TeamMember, filters: TeamFilters) => boolean
  // Client-scoped reads (the Clients carga / equipo / actividad views)
  assignmentsForClient: (clientId: string, opts?: { activeOnly?: boolean }) => ClientAssignment[]
  membersForClient: (clientId: string) => TeamMember[]
  clientMonthlyLoad: (
    clientId: string,
    month?: string,
  ) => { rows: ClientLoadRow[]; totalHours: number; totalCost: number; missingCost: number }
  memberMonthlyClientLoad: (
    memberId: string,
    clientId: string,
    month?: string,
  ) => { tracked: number; expected: number }
  // Mutations. EVERY one of them is PERSISTED through the API and async — the roster ones
  // (add/update/deactivate/bulk-status), the two ASSIGNMENT ones, the payment lifecycle
  // (approvePayment / dispatchPayment / confirmPaid / registerPayout, through
  // `runTransition` against `payoutsApi`), and, since the member-activity module, the
  // ACTIVITY ones too: addTimeEntry, addProduction (written THROUGH the monthly
  // operation), addExpense, addExtra and approveExtras. `setData` after each is a local
  // reflection of a write that already committed, not the write itself.
  //
  // This sentence has been wrong twice: it once claimed the payment ops were local, and
  // then the activity ops, each time surviving the commit that made it false. Check the
  // call sites below before editing it again.
  addMember: (values: TeamMemberFormValues) => Promise<TeamMember>
  updateMember: (id: string, values: TeamMemberFormValues) => Promise<void>
  /** Upsert a member's bank details (capability-gated server-side). Call only when the
   *  signed-in role holds `teamBankDetails`. */
  saveMemberBank: (id: string, values: TeamMemberFormValues) => Promise<void>
  deactivateMember: (id: string) => Promise<void>
  /** Bulk-set the status of several members at once (Cambiar estado). All three
   *  persist: 'inactive' soft-deletes via its endpoint; 'active'/'paused' write
   *  through PUT /team-members/:id. */
  setMembersStatus: (ids: string[], status: TeamMemberStatus) => Promise<void>
  addTimeEntry: (memberId: string, input: TimeEntryInput) => Promise<void>
  /** Persist a production loaded from a person or a client; the creator is
   *  `input.creatorId`. Same body as Operación mensual (`productionPayload`). */
  addProduction: (input: ProductionInput) => Promise<void>
  addExpense: (memberId: string, input: ExpenseInput) => Promise<void>
  addExtra: (memberId: string, input: ExtraInput) => Promise<void>
  /**
   * The pay-statement lifecycle. Each resolves `true` only when the SERVER accepted
   * the transition, so a caller can only claim success on a write that happened.
   * `false` means the call failed or the member has no statement for the month —
   * either way, nothing changed and nothing may say otherwise.
   */
  approvePayment: (memberId: string) => Promise<boolean>
  /** Dispatch the payout outward (approved → dispatched / "Pago en proceso"). */
  dispatchPayment: (memberId: string) => Promise<boolean>
  /** Confirm a dispatched payout cleared (dispatched → confirmed / "Pagado"). */
  confirmPaid: (memberId: string) => Promise<boolean>
  /** Register an amount actually paid against the statement (idempotent server-side). */
  registerPayout: (memberId: string, amount: number) => Promise<boolean>
  /**
   * Approve the member's pending extras (pending → approved). Persisted:
   * `POST /member-extras/approve` flips every pending `MemberExtraWork` of that member
   * in one statement and returns how many it moved; the local list is reconciled after.
   */
  approveExtras: (memberId: string) => Promise<void>
  /** Assign a member to a client (adds an active relationship row). */
  /** Persist an assignment (POST /clients/:id/assignments). AWAIT before reporting success. */
  assignMemberToClient: (
    clientId: string,
    memberId: string,
    input: AssignmentInput,
  ) => Promise<ClientAssignment>
  /**
   * Correct a live assignment (PATCH /assignments/:id). AWAIT before reporting success.
   *
   * `monthlyCost: null` ERASES the amount; omitting the key leaves it alone. Without
   * this path the only way to fix a mistyped cost was to end the assignment and make
   * a new one, which rewrites the member's tenure line.
   */
  updateMemberAssignment: (
    assignmentId: string,
    input: { monthlyCost?: number | null; estimatedMonthlyHours?: number; roleOnClient?: string },
  ) => Promise<ClientAssignment>
  /** End an assignment (DELETE /assignments/:id; soft server-side, history stays). */
  endMemberAssignment: (assignmentId: string) => Promise<ClientAssignment>
}

const TeamDataContext = createContext<TeamDataContextValue | null>(null)

/** Empty snapshot: the roster, the month's payouts + productions, the client assignments,
 *  the logged hours and the member activity (viáticos / extras) each load from the API on
 *  mount, independently. Everything starts empty — a real member has no seeded activity —
 *  and is replaced by what the server returns. `tasks` / `objectives` are the only slices
 *  left with no backend, so they stay in-session. */
const EMPTY_TEAM_DATA: TeamDataSnapshot = {
  members: [],
  clientAssignments: [],
  timeEntries: [],
  productions: [],
  expenses: [],
  extras: [],
  tasks: [],
  objectives: [],
  payoutsByMemberId: {},
}

/**
 * Owns the mutable team dataset (members + activity entries + payment status)
 * and exposes snapshot-bound reads, formatting composites and mutations through
 * `useTeamData`. Every derivation is recomputed from the current snapshot, so a
 * single mutation (logging hours, adding an extra, approving a payment) updates
 * carga, pago estimado and the statuses everywhere at once. Mock-backed —
 * resets on reload until a real backend supplies persistence.
 */
export function TeamDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<TeamDataSnapshot>(EMPTY_TEAM_DATA)
  const [status, setStatus] = useState<FetchStatus>('loading')
  const [payoutStatus, setPayoutStatus] = useState<FetchStatus>('loading')
  const [assignmentStatus, setAssignmentStatus] = useState<FetchStatus>('loading')
  /**
   * What re-runs the three loads below. `quiet` is a re-read for a surface that has just
   * opened: the rows on screen stay while it is in flight, and stay if it fails. A `refetch`
   * ("Reintentar") is the loud one, and owns the loading and error states.
   */
  const [reload, setReload] = useState({ key: 0, quiet: false })
  /** Whether the roster has loaded once. Before that, the mount load is the only read. */
  const hydrated = useRef(false)

  // The month's canonical pay statements. Fetched INDEPENDENTLY of the roster: they
  // are two stores with two failure modes, and folding them together would let a
  // payout outage blank the roster (or a roster outage hide a plan that loaded fine).
  useEffect(() => {
    let cancelled = false
    if (!reload.quiet) setPayoutStatus('loading')
    const monthId = currentTeamMonth()
    fetchPeriodPlan(monthId)
      .then(({ payouts, productions }) => {
        if (cancelled) return
        // Productions are authoritative from the API — replace the seed. One entry per
        // attributed member, so a member's "Producciones" list is answerable.
        setData((prev) => ({
          ...prev,
          payoutsByMemberId: payoutsByMember(payouts, monthId),
          productions: productionsToEntries(productions),
        }))
        setPayoutStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        if (!reload.quiet) setPayoutStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  // Load the real roster into the (otherwise empty) snapshot on mount, and again on
  // every `refetch`.
  useEffect(() => {
    let cancelled = false
    if (!reload.quiet) setStatus('loading')
    // Roster + logged hours load together and share this store's error state: both are core
    // to the team surface, so a failure of either is one failure (/ SE001).
    Promise.all([
      fetchTeamMembers(),
      fetchTimeEntries(),
      fetchMemberExpenses(),
      fetchMemberExtras(),
    ])
      .then(([members, timeEntries, expenses, extras]) => {
        if (cancelled) return
        // Merge, not replace: a member created via addMember while this initial
        // fetch was in flight (and thus absent from the response) must survive.
        setData((prev) => {
          const fetchedIds = new Set(members.map((m) => m.id))
          const localOnly = prev.members.filter((m) => !fetchedIds.has(m.id))
          // Time entries / viáticos / extras are authoritative from the API — replace the
          // seed. A row added while this fetch was in flight (real uuid id, absent from the
          // response) survives; a stale local seed id does not. `uuid` = a persisted row.
          const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i
          const keepLocal = <T extends { id: string }>(rows: T[], fetched: T[]): T[] => {
            const ids = new Set(fetched.map((r) => r.id))
            return rows.filter((r) => !ids.has(r.id) && uuid.test(r.id))
          }
          return {
            ...prev,
            members: [...localOnly, ...members],
            timeEntries: [...keepLocal(prev.timeEntries, timeEntries), ...timeEntries],
            expenses: [...keepLocal(prev.expenses, expenses), ...expenses],
            extras: [...keepLocal(prev.extras, extras), ...extras],
          }
        })
        hydrated.current = true
        setStatus('ready')
      })
      .catch(() => {
        // Do NOT swallow the failure into an empty roster: an empty `members` is
        // indistinguishable from "the team is empty", so consumers (and every ledger
        // derived from the roster, e.g. the colaboradora cuenta corriente) would render
        // a reassuring empty state on top of an outage. Surface it.
        if (cancelled) return
        if (!reload.quiet) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  /**
   * The persona↔cliente relationships, in ONE request rather than one per client.
   *
   * Fetched independently of the roster for the same reason the payouts are: three
   * stores, three failure modes. An assignment outage must not blank the roster, and
   * a roster outage must not hide relationships that loaded fine.
   *
   * Loading this is what makes the writes coherent. Persisting an assignment into a
   * snapshot nothing ever hydrates would show it until the next reload and then lose
   * it — indistinguishable from a failed save, and worse than the local-only version
   * it replaced, which at least never claimed to be durable.
   */
  useEffect(() => {
    let cancelled = false
    if (!reload.quiet) setAssignmentStatus('loading')
    fetchAssignments()
      .then((assignments) => {
        if (cancelled) return
        // Merge, not replace: one assigned while this fetch was in flight is absent
        // from the response and must survive, exactly as with the roster above.
        setData((prev) => {
          const fetchedIds = new Set(assignments.map((a) => a.id))
          // The server omits ENDED rows, so `localOnly` is mostly rows we ended here.
          // Drop those instead of carrying them: kept, they are stale duplicates of a
          // relationship that is over, and several derivations (`memberMonthlyClientLoad`)
          // `find` by (client, member) with NO status filter — so a dead row placed ahead
          // of the live one handed the table the closed assignment's hours and cost.
          //
          // What survives is only a row created here that the fetch has not seen yet,
          // and it goes LAST so a fetched copy always wins on id collision.
          const localOnly = prev.clientAssignments.filter(
            (a) => !fetchedIds.has(a.id) && (a.status ?? 'active') !== 'ended',
          )
          return { ...prev, clientAssignments: [...assignments, ...localOnly] }
        })
        setAssignmentStatus('ready')
      })
      .catch(() => {
        // Never collapsed into an empty list: "nobody is assigned to this client" is
        // a claim, and an outage is not evidence for it.
        if (cancelled) return
        if (!reload.quiet) setAssignmentStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  const refetch = useCallback(() => setReload((prev) => ({ key: prev.key + 1, quiet: false })), [])
  /**
   * This store loads on mount and on "Reintentar", and nothing else. So a write made on
   * another surface stayed invisible here for the rest of the session: a production loaded
   * or approved on Operación mensual never reached the person's Trabajo tab, because both
   * stores read the month's plan on their own. Reported 22/10 while chasing the same gap on
   * the other side. Stable, so the hook that calls it runs once per opening.
   */
  const revalidate = useCallback(() => {
    if (hydrated.current) setReload((prev) => ({ key: prev.key + 1, quiet: true }))
  }, [])

  const value = useMemo<TeamDataContextValue>(() => {
    const monthId = currentTeamMonth()

    /**
     * Run one lifecycle transition against the member's canonical payout row.
     *
     * The payout id comes from the loaded statement, never from the member id: the
     * transitions are conditional server updates filtered on the status they expect
     * to move FROM, so an id that does not name a real row (or a member with no plan
     * this month) must resolve `false` rather than look like a no-op success.
     * The response IS the next state — it replaces the row instead of the caller
     * guessing what the server did.
     */
    async function runTransition(
      memberId: string,
      call: (payoutId: string) => Promise<PayoutStatementDto>,
    ): Promise<boolean> {
      const payoutId = data.payoutsByMemberId[memberId]?.id
      if (!payoutId) return false
      try {
        const updated = await call(payoutId)
        setData((prev) => ({
          ...prev,
          payoutsByMemberId: {
            ...prev.payoutsByMemberId,
            [updated.teamMemberId]: payoutToStatement(updated, monthId),
          },
        }))
        return true
      } catch {
        return false
      }
    }

    return {
      members: data.members,
      isLoading: status === 'loading',
      isError: status === 'error',
      isPayoutsError: payoutStatus === 'error',
      isAssignmentsError: assignmentStatus === 'error',
      refetch,
      revalidate,
      memberById: (id) => memberById(data, id),
      // Assignments now live in the snapshot, so these read live state — assigning
      // or ending a member from Clients reflects in the member's Team view at once.
      assignmentsForMember: (id) => assignmentsForMember(data, id),
      timeEntriesForMember: (id) => timeEntriesForMember(data, id),
      productionsForMember: (id) => productionsForMember(data, id),
      expensesForMember: (id) => expensesForMember(data, id),
      extrasForMember: (id) => extrasForMember(data, id),
      tasksForMember: (id) => tasksForMember(data, id),
      objectivesForMember: (id) => objectivesForMember(data, id),
      activityEventsForMember: (id) => activityEventsForMember(data, id),
      clientById: (clientId) => clientById(clientId),
      clientsForMember: (id) => clientsForMember(data, id),
      trackedHoursForMember: (id) => trackedHoursForMember(data, id),
      trackedHoursForMemberClient: (id, clientId) => trackedHoursForMemberClient(data, id, clientId),
      expectedHoursForMember: (id) => expectedHoursForMember(data, id),
      loadStatusForMember: (id) => loadStatusForMember(data, id),
      loadPercent: (id) => loadPercent(data, id),
      loadHoursLabel: (id) => loadHoursLabel(data, id),
      productionsCountForMember: (id) => productionsCountForMember(data, id),
      expensesTotalForMember: (id) => expensesTotalForMember(data, id),
      pendingExtrasForMember: (id) => pendingExtrasForMember(data, id),
      bankCompleteness,
      statementForMember: (id) => statementForMember(data, id),
      estimatedPayForMember: (id) => estimatedPayForMember(data, id),
      paymentHistoryForMember: (id) => paymentHistoryForMember(data, id),
      lastUpdatedForMember: (id) => lastUpdatedForMember(data, id),
      extrasDisplay: (id) => extrasDisplay(data, id),
      memberAlerts: (member) => memberAlerts(data, member),
      primaryAlert: (member) => primaryAlert(data, member),
      teamInsightDisplay: (member) => teamInsightDisplay(data, member),
      teamSearchText: (member) => teamSearchText(data, member),
      teamMatchesFilters: (member, filters) => teamMatchesFilters(data, member, filters),
      assignmentsForClient: (clientId, opts) => assignmentsForClient(data, clientId, opts),
      membersForClient: (clientId) => membersForClient(data, clientId),
      clientMonthlyLoad: (clientId, month) => clientMonthlyLoad(data, clientId, month),
      memberMonthlyClientLoad: (memberId, clientId, month) =>
        memberMonthlyClientLoad(data, memberId, clientId, month),

      addMember: async (values) => {
        const created = await createTeamMemberViaApi(values)
        // No payout entry is seeded for them: a new member has no plan for the month
        // until one is created in `/operacion-mensual`. Seeding a 'pending' status here
        // used to conjure a statement out of nothing.
        setData((prev) => ({ ...prev, members: [created, ...prev.members] }))
        // Return the created member so the dialog can save bank details against its new id.
        return created
      },
      // Bank details write, capability-gated server-side. The dialog only calls this when
      // the signed-in role holds `teamBankDetails`, so a role without it never 403s here.
      saveMemberBank: async (id, values) => {
        await saveMemberBankViaApi(id, values)
        // The member already in state was answered BEFORE this write, so its derived flags
        // are stale; re-derive them from what was just saved (the same rule the API runs).
        const bankStatus = bankDetailsCompleteness({
          bankName: values.bankName.trim(),
          accountHolder: values.accountHolder.trim(),
          cbuOrCvu: values.cbuOrCvu.trim(),
          alias: values.bankAlias.trim(),
        })
        setData((prev) => ({
          ...prev,
          members: prev.members.map((member) =>
            member.id === id ? { ...member, bankStatus, bankComplete: bankStatus === 'complete' } : member,
          ),
        }))
      },
      updateMember: async (id, values) => {
        const updated = await updateTeamMemberViaApi(id, values)
        setData((prev) => ({
          ...prev,
          members: prev.members.map((member) => (member.id === id ? updated : member)),
        }))
      },
      deactivateMember: async (id) => {
        // The API soft-deletes it (GET /team-members hides it), so drop it locally too.
        await deactivateTeamMemberViaApi(id)
        setData((prev) => ({
          ...prev,
          members: prev.members.filter((member) => member.id !== id),
        }))
      },
      setMembersStatus: async (ids, status) => {
        if (status === 'inactive') {
          // Only deactivation has an endpoint. Use allSettled so a partial failure
          // still removes the ones that succeeded (server-side they're gone), then
          // surface the error for the rest.
          const results = await Promise.allSettled(
            ids.map((id) => deactivateTeamMemberViaApi(id)),
          )
          const done = new Set(ids.filter((_, i) => results[i].status === 'fulfilled'))
          setData((prev) => ({
            ...prev,
            members: prev.members.filter((member) => !done.has(member.id)),
          }))
          if (results.some((r) => r.status === 'rejected')) {
            throw new Error('Some members could not be deactivated')
          }
          return
        }
        // 'active'/'paused' persist through the update endpoint. allSettled so a partial
        // failure still reconciles the ones that saved, then surfaces the rest.
        const results = await Promise.allSettled(
          ids.map((id) => setTeamMemberStatusViaApi(id, status)),
        )
        const savedById = new Map(
          results.flatMap((r, i) =>
            r.status === 'fulfilled' ? ([[ids[i], r.value]] as const) : [],
          ),
        )
        setData((prev) => ({
          ...prev,
          members: prev.members.map((member) => savedById.get(member.id) ?? member),
        }))
        if (results.some((r) => r.status === 'rejected')) {
          throw new Error('Some members could not be updated')
        }
      },
      addTimeEntry: async (memberId, input) => {
        // Persist through the API (POST /team-members/:id/time-entries), then prepend the
        // server row so it survives a reload instead of vanishing with the session.
        const entry = await addTimeEntryViaApi(memberId, input)
        setData((prev) => ({ ...prev, timeEntries: [entry, ...prev.timeEntries] }))
      },
      addProduction: async (input) => {
        // Persists as a real monthly Production (the monthly operation owns the entity; the
        // team surface writes THROUGH it, not beside it).
        const entries = await addMemberProductionViaApi(input)
        // This store holds the CURRENT month's productions (it reads that month's plan), so
        // one dated in another month is saved there and does not belong here.
        const month = currentTeamMonth()
        const here = entries.filter((entry) => entry.date.startsWith(month))
        setData((prev) => ({ ...prev, productions: [...here, ...prev.productions] }))
      },
      addExpense: async (memberId, input) => {
        // Persist (POST /member-expenses), then prepend the server row so it survives a reload.
        const entry = await addMemberExpenseViaApi(memberId, input)
        setData((prev) => ({ ...prev, expenses: [entry, ...prev.expenses] }))
      },
      addExtra: async (memberId, input) => {
        const entry = await addMemberExtraViaApi(memberId, input)
        setData((prev) => ({ ...prev, extras: [entry, ...prev.extras] }))
      },
      approvePayment: (memberId) => runTransition(memberId, (id) => payoutsApi.approve(id)),
      dispatchPayment: (memberId) => runTransition(memberId, (id) => payoutsApi.dispatch(id)),
      confirmPaid: (memberId) => runTransition(memberId, (id) => payoutsApi.confirm(id)),
      registerPayout: (memberId, amount) =>
        runTransition(memberId, (id) =>
          // A fresh idempotency key per attempt, so a retry after a network error
          // cannot post the same amount twice.
          payoutsApi.register(id, String(Math.round(amount * 100)), crypto.randomUUID()),
        ),
      approveExtras: async (memberId) => {
        // Persist the bulk approve (POST /member-extras/approve), then reflect it locally.
        await approveMemberExtrasViaApi(memberId)
        setData((prev) => ({
          ...prev,
          extras: prev.extras.map((extra) =>
            extra.teamMemberId === memberId && extra.status === 'pending'
              ? { ...extra, status: 'approved' }
              : extra,
          ),
        }))
      },
      /**
       * Persist the relationship, then reconcile with the row the server returns.
       *
       * Was a synchronous `setData` that minted an `asg-${Date.now()}` id, and the
       * dialogs toasted success on top of it — an assignment that lasted exactly as
       * long as the tab stayed open. The endpoints existed the whole time.
       *
       * The caller AWAITS this and must not report success until it resolves
       *.
       */
      assignMemberToClient: async (clientId, memberId, input) => {
        const created = await assignViaApi(clientId, memberId, {
          roleOnClient: input.roleOnClient,
          ...(input.serviceId ? { serviceId: input.serviceId } : {}),
          ...(input.estimatedMonthlyHours
            ? { estimatedMonthlyHours: input.estimatedMonthlyHours }
            : {}),
          // `!= null`, unlike the two spreads above: a typed 0 is an agreed amount.
          ...(input.monthlyCost != null ? { monthlyCost: input.monthlyCost } : {}),
        })
        setData((prev) => ({ ...prev, clientAssignments: [created, ...prev.clientAssignments] }))
        return created
      },
      updateMemberAssignment: async (assignmentId, input) => {
        // AWAIT the round trip before touching the snapshot: the server is what decides
        // the row, and reconciling first would show a figure no write has confirmed
        //.
        const updated = await updateAssignmentViaApi(assignmentId, input)
        setData((prev) => ({
          ...prev,
          clientAssignments: prev.clientAssignments.map((a) =>
            a.id === updated.id ? updated : a,
          ),
        }))
        return updated
      },
      endMemberAssignment: async (assignmentId) => {
        // Soft-end server-side, so the row comes back closed rather than removed —
        // history stays attributable and a mid-month baja keeps its hours.
        const ended = await endAssignmentViaApi(assignmentId)
        setData((prev) => ({
          ...prev,
          clientAssignments: prev.clientAssignments.map((a) => (a.id === ended.id ? ended : a)),
        }))
        return ended
      },
    }
  }, [data, status, payoutStatus, assignmentStatus, refetch, revalidate])

  return <TeamDataContext.Provider value={value}>{children}</TeamDataContext.Provider>
}

export function useTeamData(): TeamDataContextValue {
  const value = useContext(TeamDataContext)
  if (!value) throw new Error('useTeamData must be used within a TeamDataProvider')
  return value
}

/**
 * Re-read the team store when the calling surface opens, so a write made elsewhere (a
 * production loaded or approved on Operación mensual, a payout registered there) shows
 * here. Once per mount.
 */
export function useRevalidateTeamOnOpen(): void {
  const { revalidate } = useTeamData()
  useEffect(() => {
    revalidate()
  }, [revalidate])
}
