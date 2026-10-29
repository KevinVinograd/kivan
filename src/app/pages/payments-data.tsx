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

type FetchStatus = 'loading' | 'ready' | 'error'

export type PaymentsContextValue = {
  payments: Payment[]
  isLoading: boolean
  isError: boolean
  refetch: () => void
  applyPayment: (next: Payment) => void
  createPayment: (input: CreatePagoInput) => Promise<Payment>
  registerPayment: (
    id: string,
    amount: number,
    paymentDate?: string,
    treasuryAccountId?: string,
    method?: PaymentMethod,
  ) => Promise<Payment>
  updatePayment: (id: string, input: UpdatePagoInput) => Promise<Payment>
  approvePayment: (id: string) => Promise<Payment>
  cancelPayment: (id: string) => Promise<Payment>
}

const PaymentsContext = createContext<PaymentsContextValue | null>(null)

export function PaymentsProvider({ children }: { children: ReactNode }) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [status, setStatus] = useState<FetchStatus>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const queryClient = useQueryClient()

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
        if (cancelled) return
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const value = useMemo<PaymentsContextValue>(() => {
    const upsert = (next: Payment) =>
      setPayments((rows) =>
        rows.some((row) => row.id === next.id)
          ? rows.map((row) => (row.id === next.id ? next : row))
          : [next, ...rows],
      )
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
