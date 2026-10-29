import { useQuery } from '@tanstack/react-query'

import { ledgerApi, type LedgerEntityType, type LedgerPeriodSummaryDto } from '@/api/ledger'
import { paymentsApi, type PaymentBankDto } from '@/api/payments'
import { payoutsApi, type PayoutStatementDto } from '@/api/payouts'
import { queryKeys } from '@/queries/keys'
import type { Payment } from './pagos-mock-data'

export interface DetailQuery<T> {
  data: T | null
  isLoading: boolean
  isError: boolean
}

export function paymentLedgerAccount(
  payment: Payment,
): { entityType: LedgerEntityType; entityId: string } | null {
  if (payment.recipientType === 'provider' && payment.providerId) {
    return { entityType: 'provider', entityId: payment.providerId }
  }
  if (
    (payment.recipientType === 'collaborator' || payment.recipientType === 'employee') &&
    payment.teamMemberId
  ) {
    return { entityType: 'teamMember', entityId: payment.teamMemberId }
  }
  return null
}

export function hasPayoutStatement(payment: Payment): boolean {
  return (
    (payment.recipientType === 'collaborator' || payment.recipientType === 'employee') &&
    Boolean(payment.teamMemberId)
  )
}

export function usePayoutForPayment(payment: Payment | null): DetailQuery<PayoutStatementDto> {
  const enabled = payment !== null && hasPayoutStatement(payment)
  const teamMemberId = payment?.teamMemberId ?? ''
  const period = payment?.period ?? ''

  const query = useQuery({
    queryKey: queryKeys.payouts.byMemberPeriod(teamMemberId, period),
    queryFn: () => payoutsApi.list({ teamMemberId, period, limit: 1 }),
    enabled,
  })

  return {
    data: query.data?.items[0] ?? null,
    isLoading: enabled && query.isPending,
    isError: query.isError,
  }
}

export function laneScopeHonoured(
  statement: { balancesMinor?: Record<string, string> } | undefined,
): boolean {
  return Object.keys(statement?.balancesMinor ?? {}).length > 0
}

export function useLedgerForPayment(
  payment: Payment | null,
): DetailQuery<LedgerPeriodSummaryDto> {
  const account = payment ? paymentLedgerAccount(payment) : null
  const enabled = account !== null
  const period = payment?.period ?? ''
  const currency = payment?.currency ?? 'ARS'

  const query = useQuery({
    queryKey: queryKeys.ledger.statement(
      account?.entityType ?? 'none',
      account?.entityId ?? 'none',
      period,
      currency,
    ),
    queryFn: () =>
      ledgerApi.statement(account!.entityType, account!.entityId, {
        period,
        currency,
        limit: 1,
      }),
    enabled,
  })

  return {
    data: laneScopeHonoured(query.data) ? (query.data?.period ?? null) : null,
    isLoading: enabled && query.isPending,
    isError: query.isError,
  }
}

export function useBankForPayment(payment: Payment | null): DetailQuery<PaymentBankDto> {
  const enabled = payment !== null && paymentLedgerAccount(payment) !== null
  const id = payment?.id ?? ''

  const query = useQuery({
    queryKey: queryKeys.payments.bank(id),
    queryFn: () => paymentsApi.bank(id),
    enabled,
  })

  return {
    data: query.data?.bank ?? null,
    isLoading: enabled && query.isPending,
    isError: query.isError,
  }
}
