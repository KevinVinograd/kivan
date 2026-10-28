import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { toast } from '@/app/components/components'
import { queryKeys } from '@/queries/keys'
import { workspaceApi, type WorkspaceDto } from '@/api/workspace'

import {
  createAccountViaApi,
  createCommitmentViaApi,
  deleteAccountViaApi,
  deleteCommitmentViaApi,
  fetchAccounts,
  fetchCommitments,
  fetchTreasuryMovements,
  updateAccountViaApi,
  updateCommitmentViaApi,
  type SettlementMovement,
} from './treasury-api-data'
import {
  seedCashAccount,
  type Account,
  type CashAccount,
  type CommittedItem,
} from './treasury-mock-data'

/**
 * Shared Treasury (cashflow) store, backed by TanStack Query. The multi-currency
 * accounts (Posición de Saldos) and the committed-items forward register both load
 * and persist against the real API (`/treasury/accounts`, `/treasury/commitments`)
 * with optimistic concurrency. The legacy CashAccount opening-balance anchor the
 * projection engine consumes stays local (no backend entity).
 *
 * SERVER-STATE: the query cache IS the store.
 * This used to be a pair of `useEffect` fetches whose failures were swallowed by
 * `.catch(() => {})`, which left `accounts` as `[]` — and `/cashflow` derives the
 * projection's opening balance from that array. A dead `/treasury/accounts` therefore
 * drew a 13-week cash projection anchored at $0 and fired a cash alert off it, with no
 * indication anything had failed. A wrong money projection is worse than no projection,
 * so the failure is now surfaced: `isError` / `refetch` drive a real error state.
 */

export type TreasuryContextValue = {
  /** Legacy single opening-balance anchor the projection engine still consumes (ARS lane). */
  account: CashAccount
  /** The multi-account / multi-currency treasury accounts (the Posición Saldos + reserve). */
  accounts: Account[]
  commitments: CommittedItem[]
  /** What cobros and pagos have done to the balances since the position anchor.
   *  Provenance for the Saldos rows — already inside `accounts[].balances`, so never
   *  added to a total. */
  movements: SettlementMovement[]
  /** True while the first accounts/commitments fetch is in flight (no data yet). */
  isLoading: boolean
  /** True while ANY treasury fetch is in flight — initial load or an explicit `refetch()`,
   *  so a retry shows feedback rather than appearing to do nothing. */
  isFetching: boolean
  /**
   * True when either treasury fetch failed. Consumers MUST NOT render a projection,
   * a balance or a cash alert while this is true: with no accounts the opening balance
   * derives to 0, and a confident $0 is indistinguishable from a real empty treasury.
   */
  isError: boolean
  /** Re-run both treasury fetches (wired to the "Reintentar" action). */
  refetch: () => void
  /** Set the position anchor date (M3 settings → "Fecha de la posición"). Persists to
   *  Workspace.positionAsOf via PUT /workspace (optimistic; reverts + toasts on failure).
   *  Only `openingBalanceDate` is persisted — the other CashAccount fields are derived. */
  updateAccount: (next: CashAccount) => void
  /** Persist a brand-new account (POST /treasury/accounts) and prepend the server row. */
  addAccount: (next: Omit<Account, 'id'>) => Promise<void>
  /** Persist an account edit (PUT, optimistic version) and reconcile the row. */
  applyAccount: (next: Account) => Promise<void>
  /** Soft-delete an account (DELETE, optimistic version) and drop it. */
  removeAccount: (id: string) => Promise<void>
  /** Persist a brand-new committed item (POST /treasury/commitments) and prepend it. */
  addCommitment: (next: Omit<CommittedItem, 'id'>) => Promise<void>
  /** Persist a commitment edit (PUT, optimistic version) and reconcile the row. */
  applyCommitment: (next: CommittedItem) => Promise<void>
  /** Soft-delete a commitment (DELETE, optimistic version) and drop it. */
  removeCommitment: (id: string) => Promise<void>
}

const TreasuryContext = createContext<TreasuryContextValue | null>(null)

const accountsKey = queryKeys.treasury.accounts()
const commitmentsKey = queryKeys.treasury.commitments()

// Fetch-once semantics, mirroring `receivables-data.tsx`: the mutations below reconcile
// the cache directly (pessimistic — financial rows, the convention), and the
// `account` anchor is client-only, so a background refetch would fight both. Load once;
// "Reintentar" re-fetches explicitly.
const FETCH_ONCE = {
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const

// Stable module-level fallbacks. `query.data ?? []` would mint a NEW array on every render
// while the fetch is in flight, which lands in the context value's memo deps and recreates
// the value (and re-renders every consumer) on each render of the loading state.
const NO_ACCOUNTS: Account[] = []
const NO_COMMITMENTS: CommittedItem[] = []
const NO_MOVEMENTS: SettlementMovement[] = []

export function TreasuryProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // The position anchor date now persists: it lives on Workspace.positionAsOf and rides the
  // /workspace GET/PUT. The rest of the legacy CashAccount (name, opening balance) is derived
  // — openingBalance is overwritten from the real accounts sum in cashflow-page, so only the
  // date matters here. Falls back to the seed anchor when the workspace has none yet.
  const workspaceQuery = useQuery({
    queryKey: queryKeys.workspace.current,
    queryFn: workspaceApi.get,
    ...FETCH_ONCE,
  })
  const positionAsOf = workspaceQuery.data?.positionAsOf ?? seedCashAccount.openingBalanceDate
  const account = useMemo<CashAccount>(
    () => ({ ...seedCashAccount, openingBalanceDate: positionAsOf }),
    [positionAsOf],
  )

  const updatePositionMutation = useMutation({
    mutationFn: (isoDate: string) => workspaceApi.update({ positionAsOf: isoDate }),
    // Optimistic: reflect the new anchor immediately so the DatePicker is responsive.
    onMutate: (isoDate) => {
      const prev = queryClient.getQueryData<WorkspaceDto>(queryKeys.workspace.current)
      queryClient.setQueryData<WorkspaceDto | undefined>(queryKeys.workspace.current, (ws) =>
        ws ? { ...ws, positionAsOf: isoDate } : ws,
      )
      return { prev }
    },
    onError: (_error, _isoDate, context) => {
      if (context?.prev) queryClient.setQueryData(queryKeys.workspace.current, context.prev)
      toast.error('No se pudo guardar la fecha de la posición')
    },
    onSuccess: (dto) => queryClient.setQueryData(queryKeys.workspace.current, dto),
  })
  const updatePositionAsync = updatePositionMutation.mutateAsync

  const accountsQuery = useQuery({ queryKey: accountsKey, queryFn: fetchAccounts, ...FETCH_ONCE })
  const commitmentsQuery = useQuery({
    queryKey: commitmentsKey,
    queryFn: fetchCommitments,
    ...FETCH_ONCE,
  })

  // Not FETCH_ONCE: a cobro or a pago registered on another screen invalidates
  // `queryKeys.treasury.all`, and this has to come back with the movement that caused
  // the balance to change. It is a pure read with no local edits to protect.
  const movementsQuery = useQuery({
    queryKey: queryKeys.treasury.movements(positionAsOf),
    queryFn: () => fetchTreasuryMovements(positionAsOf),
  })

  const accounts = accountsQuery.data ?? NO_ACCOUNTS
  const commitments = commitmentsQuery.data ?? NO_COMMITMENTS
  const movements = movementsQuery.data ?? NO_MOVEMENTS

  const setAccounts = (rows: Account[]) => queryClient.setQueryData(accountsKey, rows)
  const setCommitments = (rows: CommittedItem[]) => queryClient.setQueryData(commitmentsKey, rows)

  const upsertAccount = (next: Account) =>
    queryClient.setQueryData<Account[]>(accountsKey, (rows = []) =>
      rows.some((row) => row.id === next.id)
        ? rows.map((row) => (row.id === next.id ? next : row))
        : [next, ...rows],
    )
  const upsertCommitment = (next: CommittedItem) =>
    queryClient.setQueryData<CommittedItem[]>(commitmentsKey, (rows = []) =>
      rows.some((row) => row.id === next.id)
        ? rows.map((row) => (row.id === next.id ? next : row))
        : [next, ...rows],
    )

  // A stale-version 409 (concurrent edit) is only recoverable once the table holds the
  // fresh versions, so refresh in the background and then let the error surface.
  const resyncAccounts = () => {
    void fetchAccounts()
      .then(setAccounts)
      .catch(() => {})
  }
  const resyncCommitments = () => {
    void fetchCommitments()
      .then(setCommitments)
      .catch(() => {})
  }

  const addAccountMutation = useMutation({ mutationFn: createAccountViaApi, onSuccess: upsertAccount })
  const applyAccountMutation = useMutation({
    mutationFn: updateAccountViaApi,
    onSuccess: upsertAccount,
    onError: resyncAccounts,
  })
  const removeAccountMutation = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => deleteAccountViaApi(id, version),
    onSuccess: (_result, { id }) =>
      queryClient.setQueryData<Account[]>(accountsKey, (rows = []) => rows.filter((row) => row.id !== id)),
    onError: resyncAccounts,
  })

  const addCommitmentMutation = useMutation({
    mutationFn: createCommitmentViaApi,
    onSuccess: upsertCommitment,
  })
  const applyCommitmentMutation = useMutation({
    mutationFn: updateCommitmentViaApi,
    onSuccess: upsertCommitment,
    onError: resyncCommitments,
  })
  const removeCommitmentMutation = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      deleteCommitmentViaApi(id, version),
    onSuccess: (_result, { id }) =>
      queryClient.setQueryData<CommittedItem[]>(commitmentsKey, (rows = []) =>
        rows.filter((row) => row.id !== id),
      ),
    onError: resyncCommitments,
  })

  // `useMutation` returns a fresh object every render, but `mutateAsync` and `refetch` are
  // stable — depend on those, so the memo holds instead of thrashing (and no eslint-disable
  // is needed to hide the lie). Same shape as `receivables-data.tsx`.
  const { refetch: refetchAccounts } = accountsQuery
  const { refetch: refetchCommitments } = commitmentsQuery
  const { refetch: refetchWorkspace } = workspaceQuery
  const addAccountAsync = addAccountMutation.mutateAsync
  const applyAccountAsync = applyAccountMutation.mutateAsync
  const removeAccountAsync = removeAccountMutation.mutateAsync
  const addCommitmentAsync = addCommitmentMutation.mutateAsync
  const applyCommitmentAsync = applyCommitmentMutation.mutateAsync
  const removeCommitmentAsync = removeCommitmentMutation.mutateAsync

  const value = useMemo<TreasuryContextValue>(
    () => ({
      account,
      accounts,
      commitments,
      movements,
      isLoading: accountsQuery.isLoading || commitmentsQuery.isLoading,
      isFetching:
        accountsQuery.isFetching ||
        commitmentsQuery.isFetching ||
        movementsQuery.isFetching ||
        workspaceQuery.isFetching,
      // ANY of the three failing poisons the projection: without accounts the opening
      // balance is 0, without commitments the forward register is short, and without
      // movements every Saldos row asserts "nothing has moved this balance" — a claim,
      // not an absence. All three are money figures. The workspace fetch is NOT included:
      // the position date has a safe fallback (the seed anchor), so a failed /workspace
      // shouldn't blank the whole cashflow.
      isError: accountsQuery.isError || commitmentsQuery.isError || movementsQuery.isError,
      refetch: () => {
        void refetchAccounts()
        void refetchCommitments()
        void refetchWorkspace()
      },
      // Persist ONLY the anchor date to Workspace.positionAsOf (the mutation is optimistic).
      updateAccount: (next) => {
        void updatePositionAsync(next.openingBalanceDate)
      },
      addAccount: async (next) => {
        await addAccountAsync(next)
      },
      applyAccount: async (next) => {
        await applyAccountAsync(next)
      },
      removeAccount: async (id) => {
        const target = accounts.find((row) => row.id === id)
        await removeAccountAsync({ id, version: target?.version ?? 0 })
      },
      addCommitment: async (next) => {
        await addCommitmentAsync(next)
      },
      applyCommitment: async (next) => {
        await applyCommitmentAsync(next)
      },
      removeCommitment: async (id) => {
        const target = commitments.find((row) => row.id === id)
        await removeCommitmentAsync({ id, version: target?.version ?? 0 })
      },
    }),
    [
      account,
      accounts,
      commitments,
      accountsQuery.isLoading,
      accountsQuery.isFetching,
      accountsQuery.isError,
      movements,
      movementsQuery.isFetching,
      movementsQuery.isError,
      commitmentsQuery.isLoading,
      commitmentsQuery.isFetching,
      commitmentsQuery.isError,
      workspaceQuery.isFetching,
      refetchAccounts,
      refetchCommitments,
      refetchWorkspace,
      updatePositionAsync,
      addAccountAsync,
      applyAccountAsync,
      removeAccountAsync,
      addCommitmentAsync,
      applyCommitmentAsync,
      removeCommitmentAsync,
    ],
  )

  return <TreasuryContext.Provider value={value}>{children}</TreasuryContext.Provider>
}

export function useTreasury(): TreasuryContextValue {
  const value = useContext(TreasuryContext)
  if (!value) throw new Error('useTreasury must be used within a TreasuryProvider')
  return value
}
