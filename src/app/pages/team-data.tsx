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

export type AssignmentInput = {
  roleOnClient: string
  serviceId?: string
  estimatedMonthlyHours?: number
  monthlyCost?: number
}

type FetchStatus = 'loading' | 'ready' | 'error'

export type TeamDataContextValue = {
  members: TeamMember[]
  isLoading: boolean
  isError: boolean
  isPayoutsError: boolean
  isAssignmentsError: boolean
  refetch: () => void
  revalidate: () => void
  memberById: (id: string) => TeamMember | undefined
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
  addMember: (values: TeamMemberFormValues) => Promise<TeamMember>
  updateMember: (id: string, values: TeamMemberFormValues) => Promise<void>
  saveMemberBank: (id: string, values: TeamMemberFormValues) => Promise<void>
  deactivateMember: (id: string) => Promise<void>
  setMembersStatus: (ids: string[], status: TeamMemberStatus) => Promise<void>
  addTimeEntry: (memberId: string, input: TimeEntryInput) => Promise<void>
  addProduction: (input: ProductionInput) => Promise<void>
  addExpense: (memberId: string, input: ExpenseInput) => Promise<void>
  addExtra: (memberId: string, input: ExtraInput) => Promise<void>
  approvePayment: (memberId: string) => Promise<boolean>
  dispatchPayment: (memberId: string) => Promise<boolean>
  confirmPaid: (memberId: string) => Promise<boolean>
  registerPayout: (memberId: string, amount: number) => Promise<boolean>
  approveExtras: (memberId: string) => Promise<void>
  assignMemberToClient: (
    clientId: string,
    memberId: string,
    input: AssignmentInput,
  ) => Promise<ClientAssignment>
  updateMemberAssignment: (
    assignmentId: string,
    input: { monthlyCost?: number | null; estimatedMonthlyHours?: number; roleOnClient?: string },
  ) => Promise<ClientAssignment>
  endMemberAssignment: (assignmentId: string) => Promise<ClientAssignment>
}

const TeamDataContext = createContext<TeamDataContextValue | null>(null)

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

export function TeamDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<TeamDataSnapshot>(EMPTY_TEAM_DATA)
  const [status, setStatus] = useState<FetchStatus>('loading')
  const [payoutStatus, setPayoutStatus] = useState<FetchStatus>('loading')
  const [assignmentStatus, setAssignmentStatus] = useState<FetchStatus>('loading')
  const [reload, setReload] = useState({ key: 0, quiet: false })
  const hydrated = useRef(false)

  useEffect(() => {
    let cancelled = false
    if (!reload.quiet) setPayoutStatus('loading')
    const monthId = currentTeamMonth()
    fetchPeriodPlan(monthId)
      .then(({ payouts, productions }) => {
        if (cancelled) return
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

  useEffect(() => {
    let cancelled = false
    if (!reload.quiet) setStatus('loading')
    Promise.all([
      fetchTeamMembers(),
      fetchTimeEntries(),
      fetchMemberExpenses(),
      fetchMemberExtras(),
    ])
      .then(([members, timeEntries, expenses, extras]) => {
        if (cancelled) return
        setData((prev) => {
          const fetchedIds = new Set(members.map((m) => m.id))
          const localOnly = prev.members.filter((m) => !fetchedIds.has(m.id))
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
        if (cancelled) return
        if (!reload.quiet) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  useEffect(() => {
    let cancelled = false
    if (!reload.quiet) setAssignmentStatus('loading')
    fetchAssignments()
      .then((assignments) => {
        if (cancelled) return
        setData((prev) => {
          const fetchedIds = new Set(assignments.map((a) => a.id))
          const localOnly = prev.clientAssignments.filter(
            (a) => !fetchedIds.has(a.id) && (a.status ?? 'active') !== 'ended',
          )
          return { ...prev, clientAssignments: [...assignments, ...localOnly] }
        })
        setAssignmentStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        if (!reload.quiet) setAssignmentStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  const refetch = useCallback(() => setReload((prev) => ({ key: prev.key + 1, quiet: false })), [])
  const revalidate = useCallback(() => {
    if (hydrated.current) setReload((prev) => ({ key: prev.key + 1, quiet: true }))
  }, [])

  const value = useMemo<TeamDataContextValue>(() => {
    const monthId = currentTeamMonth()

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
        setData((prev) => ({ ...prev, members: [created, ...prev.members] }))
        return created
      },
      saveMemberBank: async (id, values) => {
        await saveMemberBankViaApi(id, values)
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
        await deactivateTeamMemberViaApi(id)
        setData((prev) => ({
          ...prev,
          members: prev.members.filter((member) => member.id !== id),
        }))
      },
      setMembersStatus: async (ids, status) => {
        if (status === 'inactive') {
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
        const entry = await addTimeEntryViaApi(memberId, input)
        setData((prev) => ({ ...prev, timeEntries: [entry, ...prev.timeEntries] }))
      },
      addProduction: async (input) => {
        const entries = await addMemberProductionViaApi(input)
        const month = currentTeamMonth()
        const here = entries.filter((entry) => entry.date.startsWith(month))
        setData((prev) => ({ ...prev, productions: [...here, ...prev.productions] }))
      },
      addExpense: async (memberId, input) => {
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
          payoutsApi.register(id, String(Math.round(amount * 100)), crypto.randomUUID()),
        ),
      approveExtras: async (memberId) => {
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
      assignMemberToClient: async (clientId, memberId, input) => {
        const created = await assignViaApi(clientId, memberId, {
          roleOnClient: input.roleOnClient,
          ...(input.serviceId ? { serviceId: input.serviceId } : {}),
          ...(input.estimatedMonthlyHours
            ? { estimatedMonthlyHours: input.estimatedMonthlyHours }
            : {}),
          ...(input.monthlyCost != null ? { monthlyCost: input.monthlyCost } : {}),
        })
        setData((prev) => ({ ...prev, clientAssignments: [created, ...prev.clientAssignments] }))
        return created
      },
      updateMemberAssignment: async (assignmentId, input) => {
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

export function useRevalidateTeamOnOpen(): void {
  const { revalidate } = useTeamData()
  useEffect(() => {
    revalidate()
  }, [revalidate])
}
