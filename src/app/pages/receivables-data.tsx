import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { queryKeys } from '@/queries/keys'
import { type Receivable } from './cobros-mock-data'
import {
  associateInvoiceViaApi,
  cancelReceivableViaApi,
  collectReceivableViaApi,
  createReceivableViaApi,
  fetchReceivables,
  generateInvoiceViaApi,
  generateMonthlyFeesViaApi,
  markInvoiceSentViaApi,
  updateReceivableViaApi,
  type CreateCobroInput,
  type MonthlyFeeGenerationResult,
  type UpdateCobroInput,
} from './receivables-api-data'
import type { GenerateMonthlyFeesInput } from '@/api/receivables'

export type ReceivablesContextValue = {
  receivables: Receivable[]
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  dataUpdatedAt: number
  refetch: () => void
  applyReceivable: (next: Receivable) => void
  createReceivable: (input: CreateCobroInput) => Promise<Receivable>
  collectReceivable: (
    id: string,
    amount: number,
    collectedAt?: string,
    treasuryAccountId?: string,
  ) => Promise<Receivable>
  updateReceivable: (id: string, input: UpdateCobroInput) => Promise<Receivable>
  generateInvoice: (id: string, emitterId: string) => Promise<Receivable>
  associateInvoice: (id: string, invoiceNumber: string, issuedAt: string) => Promise<Receivable>
  markInvoiceSent: (id: string) => Promise<Receivable>
  cancelReceivable: (id: string) => Promise<Receivable>
  generateMonthlyFees: (input: GenerateMonthlyFeesInput) => Promise<MonthlyFeeGenerationResult>
}

const ReceivablesContext = createContext<ReceivablesContextValue | null>(null)

const listKey = queryKeys.receivables.lists()

export function ReceivablesProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: listKey,
    queryFn: fetchReceivables,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const upsertInCache = (next: Receivable) =>
    queryClient.setQueryData<Receivable[]>(listKey, (rows = []) =>
      rows.some((row) => row.id === next.id)
        ? rows.map((row) => (row.id === next.id ? next : row))
        : [next, ...rows],
    )
  const removeFromCache = (id: string) =>
    queryClient.setQueryData<Receivable[]>(listKey, (rows = []) => rows.filter((row) => row.id !== id))

  const createMutation = useMutation({ mutationFn: createReceivableViaApi, onSuccess: upsertInCache })
  const collectMutation = useMutation({
    mutationFn: ({
      id,
      amount,
      collectedAt,
      treasuryAccountId,
    }: {
      id: string
      amount: number
      collectedAt?: string
      treasuryAccountId?: string
    }) => collectReceivableViaApi(id, amount, collectedAt, treasuryAccountId),
    onSuccess: (next) => {
      upsertInCache(next)
      void queryClient.invalidateQueries({ queryKey: queryKeys.treasury.all })
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCobroInput }) => updateReceivableViaApi(id, input),
    onSuccess: upsertInCache,
  })
  const invoiceMutation = useMutation({
    mutationFn: ({ id, emitterId }: { id: string; emitterId: string }) => generateInvoiceViaApi(id, emitterId),
    onSuccess: upsertInCache,
  })
  const associateMutation = useMutation({
    mutationFn: ({ id, invoiceNumber, issuedAt }: { id: string; invoiceNumber: string; issuedAt: string }) =>
      associateInvoiceViaApi(id, invoiceNumber, issuedAt),
    onSuccess: upsertInCache,
  })
  const markSentMutation = useMutation({
    mutationFn: (id: string) => markInvoiceSentViaApi(id),
    onSuccess: upsertInCache,
  })
  const cancelMutation = useMutation({
    mutationFn: cancelReceivableViaApi,
    onSuccess: (cancelled) => removeFromCache(cancelled.id),
  })
  const generateMonthlyFeesMutation = useMutation({
    mutationFn: generateMonthlyFeesViaApi,
    onSuccess: (result) => result.created.forEach(upsertInCache),
  })

  const { refetch } = query
  const createAsync = createMutation.mutateAsync
  const collectAsync = collectMutation.mutateAsync
  const updateAsync = updateMutation.mutateAsync
  const invoiceAsync = invoiceMutation.mutateAsync
  const associateAsync = associateMutation.mutateAsync
  const markSentAsync = markSentMutation.mutateAsync
  const cancelAsync = cancelMutation.mutateAsync
  const generateMonthlyFeesAsync = generateMonthlyFeesMutation.mutateAsync

  const value = useMemo<ReceivablesContextValue>(
    () => ({
      receivables: query.data ?? [],
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      isError: query.isError,
      dataUpdatedAt: query.dataUpdatedAt,
      refetch: () => {
        void refetch()
      },
      applyReceivable: (next) => {
        if (queryClient.getQueryData<Receivable[]>(listKey) === undefined) return
        queryClient.setQueryData<Receivable[]>(listKey, (rows = []) =>
          rows.map((row) => (row.id === next.id ? next : row)),
        )
      },
      createReceivable: (input) => createAsync(input),
      collectReceivable: (id, amount, collectedAt, treasuryAccountId) =>
        collectAsync({ id, amount, collectedAt, treasuryAccountId }),
      updateReceivable: (id, input) => updateAsync({ id, input }),
      generateInvoice: (id, emitterId) => invoiceAsync({ id, emitterId }),
      associateInvoice: (id, invoiceNumber, issuedAt) => associateAsync({ id, invoiceNumber, issuedAt }),
      markInvoiceSent: (id) => markSentAsync(id),
      cancelReceivable: (id) => cancelAsync(id),
      generateMonthlyFees: (input) => generateMonthlyFeesAsync(input),
    }),
    [
      queryClient,
      query.data,
      query.isLoading,
      query.isFetching,
      query.isError,
      query.dataUpdatedAt,
      refetch,
      createAsync,
      collectAsync,
      updateAsync,
      invoiceAsync,
      associateAsync,
      markSentAsync,
      cancelAsync,
      generateMonthlyFeesAsync,
    ],
  )

  return <ReceivablesContext.Provider value={value}>{children}</ReceivablesContext.Provider>
}

export function useReceivables(): ReceivablesContextValue {
  const value = useContext(ReceivablesContext)
  if (!value) throw new Error('useReceivables must be used within a ReceivablesProvider')
  return value
}
