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

export type TreasuryContextValue = {
  account: CashAccount
  accounts: Account[]
  commitments: CommittedItem[]
  movements: SettlementMovement[]
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  refetch: () => void
  updateAccount: (next: CashAccount) => void
  addAccount: (next: Omit<Account, 'id'>) => Promise<void>
  applyAccount: (next: Account) => Promise<void>
  removeAccount: (id: string) => Promise<void>
  addCommitment: (next: Omit<CommittedItem, 'id'>) => Promise<void>
  applyCommitment: (next: CommittedItem) => Promise<void>
  removeCommitment: (id: string) => Promise<void>
}

const TreasuryContext = createContext<TreasuryContextValue | null>(null)

const accountsKey = queryKeys.treasury.accounts()
const commitmentsKey = queryKeys.treasury.commitments()

const FETCH_ONCE = {
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const

const NO_ACCOUNTS: Account[] = []
const NO_COMMITMENTS: CommittedItem[] = []
const NO_MOVEMENTS: SettlementMovement[] = []

export function TreasuryProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

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

  // stable — depend on those, so the memo holds instead of thrashing (and no eslint-disable
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
      isError: accountsQuery.isError || commitmentsQuery.isError || movementsQuery.isError,
      refetch: () => {
        void refetchAccounts()
        void refetchCommitments()
        void refetchWorkspace()
      },
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
