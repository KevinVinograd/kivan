import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { queryKeys } from '@/queries/keys'
import { type Payment, type PaymentMethod } from './pagos-mock-data'
import {
  approvePaymentViaApi,
  cancelPaymentViaApi,
  createPaymentViaApi,
  fetchPayments,
  registerPaymentViaApi,
  updatePaymentViaApi,
  type CreatePagoInput,
  type UpdatePagoInput,
} from './payments-api-data'

/**
 * Shared Payments store. Lifts the pagos dataset out of `PagosTab`'s local state
 * so the outgoing-payments data lives in a context the rest of the app can read
 * and derive from.
 * Mirrors the `ReceivablesProvider` shape.
 *
 * The list loads from the real API (`GET /payments`) on mount, and the core Pagos
 * mutations — create, register, approve, edit and cancel — persist through their
 * endpoints and reconcile local state with the server row they return.
 * `applyPayment` remains an OPTIMISTIC-LOCAL replace, still used by Operación
 * mensual (allocateTeamPayment) until that surface is wired.
 */
/** Lifecycle of the list fetch — never collapsed into "the list is empty". */
type FetchStatus = 'loading' | 'ready' | 'error'

export type PaymentsContextValue = {
  payments: Payment[]
  /** True while the list fetch is in flight (initial load or a `refetch`). */
  isLoading: boolean
  /**
   * True when the list fetch FAILED. Consumers must branch on this before reading
   * `payments`: an empty list under an error means "we could not load", not "there
   * are no pagos".
   */
  isError: boolean
  /** Re-run the list fetch — wire this to the consumer's "Reintentar" affordance. */
  refetch: () => void
  /** Optimistic local replace — for flows not yet backed by an endpoint. */
  applyPayment: (next: Payment) => void
  /** Persist a new pago (POST /payments) and prepend the server row. */
  createPayment: (input: CreatePagoInput) => Promise<Payment>
  /** Register a payment (POST /payments/:id/register) and reconcile the row.
   *  `paymentDate` is the day the money moved; omitted, the server stamps now. */
  /** Register a payment (POST /payments/:id/register). `treasuryAccountId` is where the
   *  cash left from — naming one drops that account's balance server-side, in the same
   *  transaction — and `method` is the medio, which the register path could not set
   *  before even though the column and the table column both existed. */
  registerPayment: (
    id: string,
    amount: number,
    paymentDate?: string,
    treasuryAccountId?: string,
    method?: PaymentMethod,
  ) => Promise<Payment>
  /** Edit a pago (PATCH /payments/:id) and reconcile the row. */
  updatePayment: (id: string, input: UpdatePagoInput) => Promise<Payment>
  /** Approve a pago (POST /payments/:id/approve). */
  approvePayment: (id: string) => Promise<Payment>
  /** Cancel a pago (POST /payments/:id/cancel); it leaves the visible list. */
  cancelPayment: (id: string) => Promise<Payment>
}

const PaymentsContext = createContext<PaymentsContextValue | null>(null)

export function PaymentsProvider({ children }: { children: ReactNode }) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [status, setStatus] = useState<FetchStatus>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const queryClient = useQueryClient()

  // Load the real payments on mount, and again on every `refetch`.
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    fetchPayments()
      .then((rows) => {
        if (cancelled) return
        setPayments(rows)
        setStatus('ready')
      })
      .catch(() => {
        // Do NOT swallow the failure into an empty list: an empty `payments` is
        // indistinguishable from "no pagos exist", so every consumer would render a
        // reassuring empty state on top of an outage, with no error and no retry.
        // Surface it and let the consumer offer "Reintentar".
        if (cancelled) return
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const value = useMemo<PaymentsContextValue>(() => {
    /** Replace the row by id, or prepend it when new — reconcile with the server row. */
    const upsert = (next: Payment) =>
      setPayments((rows) =>
        rows.some((row) => row.id === next.id)
          ? rows.map((row) => (row.id === next.id ? next : row))
          : [next, ...rows],
      )
    /**
     * Create, register, edit and cancel all append to the recipient's running
     * account (`apps/api/src/modules/payments/payments.service.ts` — a charge, a
     * payment, an adjustment, a reversal). That account is read through react-query
     * by the /pagos detail, and this store is a context, so nothing else connects
     * the two. Without this, registering a pago left the detail showing the KPI
     * `Saldo` at zero above a `Cuenta corriente` still reporting the full balance:
     * two contradictory money figures in one panel, the stale one being the account.
     */
    const invalidateLedger = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all })
    }
    return {
      payments,
      isLoading: status === 'loading',
      isError: status === 'error',
      refetch: () => setReloadKey((key) => key + 1),
      applyPayment: (next) =>
        setPayments((rows) => rows.map((row) => (row.id === next.id ? next : row))),
      createPayment: async (input) => {
        const created = await createPaymentViaApi(input)
        upsert(created)
        invalidateLedger()
        return created
      },
      registerPayment: async (id, amount, paymentDate, treasuryAccountId, method) => {
        const updated = await registerPaymentViaApi(id, amount, paymentDate, treasuryAccountId, method)
        upsert(updated)
        invalidateLedger()
        // The payment moved a treasury balance too, so the Cashflow's account list is
        // now stale. Invalidated rather than patched: this store does not own that cache.
        void queryClient.invalidateQueries({ queryKey: queryKeys.treasury.all })
        return updated
      },
      updatePayment: async (id, input) => {
        const updated = await updatePaymentViaApi(id, input)
        upsert(updated)
        invalidateLedger()
        return updated
      },
      approvePayment: async (id) => {
        const updated = await approvePaymentViaApi(id)
        upsert(updated)
        return updated
      },
      cancelPayment: async (id) => {
        const cancelled = await cancelPaymentViaApi(id)
        // The API soft-deletes it (GET /payments hides it), so drop it locally too.
        setPayments((rows) => rows.filter((row) => row.id !== id))
        invalidateLedger()
        return cancelled
      },
    }
  }, [payments, status, queryClient])

  return <PaymentsContext.Provider value={value}>{children}</PaymentsContext.Provider>
}

export function usePayments(): PaymentsContextValue {
  const value = useContext(PaymentsContext)
  if (!value) throw new Error('usePayments must be used within a PaymentsProvider')
  return value
}
