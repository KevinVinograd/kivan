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

/**
 * Shared Receivables store, backed by TanStack Query. The Cobros page (`/cobros`)
 * and Facturación (`/billing`) read and mutate the SAME receivables — a factura
 * generated or a cobro registered on either surface is reflected on the other at
 * once (a factura belongs to a cobro, PRD §23.2).
 *
 * SERVER-STATE REFERENCE: the query
 * cache IS the store. The list loads through `useQuery`, so `isLoading` / `isError`
 * come from the real `GET /receivables` — not a page timer — and a failure surfaces
 * (the Cobros page shows its error state + retry) instead of being swallowed into an
 * empty list. Writes go through `useMutation` and reconcile the cache in `onSuccess`;
 * they are PESSIMISTIC (await the server, then reconcile) because receivables are
 * financial records and the convention forbids optimistic updates here.
 * `applyReceivable` stays a direct local cache replace for the flows without an
 * endpoint yet (asociar / enviar factura, editar datos fiscales) used by Facturación
 * + Operación mensual.
 */
export type ReceivablesContextValue = {
  receivables: Receivable[]
  /** True while the initial `GET /receivables` is in flight (no data yet). */
  isLoading: boolean
  /** True while any receivables fetch is in flight — the initial load OR an explicit
   *  `refetch()`. Pages drive their loading skeleton off this so a retry shows feedback. */
  isFetching: boolean
  /** True when the receivables fetch failed (drives the error state + retry). */
  isError: boolean
  /**
   * When this store's cache last changed, from the query itself. It advances on a fetch
   * AND on every `setQueryData` reconcile, so a cobro registered here is observable by a
   * store that does NOT read receivables but is invalidated by them: the monthly plan
   * bundle, which is fetched once per month and otherwise never learns that a cobro was
   * collected, cancelled or generated on Cobros.
   */
  dataUpdatedAt: number
  /** Re-run the receivables fetch (wired to the Cobros "Reintentar" action). */
  refetch: () => void
  /** Optimistic local replace — for flows not yet backed by an endpoint. */
  applyReceivable: (next: Receivable) => void
  /** Persist a new cobro (POST /receivables) and prepend the server row. */
  createReceivable: (input: CreateCobroInput) => Promise<Receivable>
  /** Register a collection (POST /receivables/:id/collect) and reconcile the row.
   *  `collectedAt` is the ISO date the cash actually arrived; `treasuryAccountId` is
   *  where it landed — naming one moves that account's balance server-side, in the same
   *  transaction, which is what keeps the Cashflow Posición from falling when money
   *  comes in. */
  collectReceivable: (
    id: string,
    amount: number,
    collectedAt?: string,
    treasuryAccountId?: string,
  ) => Promise<Receivable>
  /** Edit a cobro (PATCH /receivables/:id) and reconcile the row. */
  updateReceivable: (id: string, input: UpdateCobroInput) => Promise<Receivable>
  /** Generate the comprobante (POST /receivables/:id/invoice/generate). */
  generateInvoice: (id: string, emitterId: string) => Promise<Receivable>
  /** Associate an externally emitted factura (POST /receivables/:id/invoice/associate). */
  associateInvoice: (id: string, invoiceNumber: string, issuedAt: string) => Promise<Receivable>
  /** Mark the factura / cuenta corriente as sent (POST /receivables/:id/invoice/sent). */
  markInvoiceSent: (id: string) => Promise<Receivable>
  /** Cancel a cobro (POST /receivables/:id/cancel); it leaves the visible list. */
  cancelReceivable: (id: string) => Promise<Receivable>
  /** Generate the month's retainer cobros (POST /receivables/monthly-fee/generate) and
   *  fold every created row into the list. Returns what the run actually did — including
   *  the clients it skipped, which the caller must report rather than swallow. */
  generateMonthlyFees: (input: GenerateMonthlyFeesInput) => Promise<MonthlyFeeGenerationResult>
}

const ReceivablesContext = createContext<ReceivablesContextValue | null>(null)

/** The single list key this store reads and reconciles. */
const listKey = queryKeys.receivables.lists()

export function ReceivablesProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: listKey,
    queryFn: fetchReceivables,
    // Fetch-once semantics (matching the prior fetch-on-mount model): this store also
    // carries client-only edits via `applyReceivable` (asociar / enviar factura, datos
    // fiscales) that no endpoint persists yet, and its pessimistic mutations reconcile
    // the cache directly — a background refetch would DISCARD both. So load once and
    // never auto-refetch; "Reintentar" re-fetches explicitly. Drop these options once
    // every receivables write is server-backed (then invalidate per mutation instead).
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Cache reconcilers — a successful write updates the query cache (the store).
  const upsertInCache = (next: Receivable) =>
    queryClient.setQueryData<Receivable[]>(listKey, (rows = []) =>
      rows.some((row) => row.id === next.id)
        ? rows.map((row) => (row.id === next.id ? next : row))
        : [next, ...rows],
    )
  const removeFromCache = (id: string) =>
    queryClient.setQueryData<Receivable[]>(listKey, (rows = []) => rows.filter((row) => row.id !== id))

  // Financial writes are PESSIMISTIC: await the server,
  // then reconcile — no optimistic `onMutate`.
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
    // The collection moved a treasury balance too, so the Cashflow's account list is
    // now stale. Invalidated rather than patched: this store does not own that cache.
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
    // The API soft-deletes it (GET /receivables hides it), so drop it from the cache.
    onSuccess: (cancelled) => removeFromCache(cancelled.id),
  })
  const generateMonthlyFeesMutation = useMutation({
    mutationFn: generateMonthlyFeesViaApi,
    // Fold the batch in one by one rather than invalidating: this store is fetch-once
    // (staleTime Infinity) and carries client-only edits a refetch would discard.
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
        // No-op before the initial list has loaded: writing into an undefined cache
        // would seed an empty array (dropping `next`) and flip the query to success
        // while the fetch is still in flight.
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
