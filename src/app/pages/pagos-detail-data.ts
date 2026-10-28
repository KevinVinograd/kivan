/**
 * Server data for the `/pagos` detail panel: the period's liquidación, the
 * recipient's running account, and their banking details.
 *
 * Three separate queries, deliberately. They are gated by different conditions
 * (only a team member has a liquidación; only a counterparty has a ledger; only a
 * capability holder may read a CBU), they fail independently, and a payment to a
 * gasto fijo legitimately fetches none of them. Folding them into one request
 * would make each panel's absence indistinguishable from the others' failure.
 *
 * Each fetch is scoped to ONE open payment, so it runs on selection rather than on
 * mount — hence `useQuery` per selection
 * rather than a store loaded with the list.
 */
import { useQuery } from '@tanstack/react-query'

import { ledgerApi, type LedgerEntityType, type LedgerPeriodSummaryDto } from '@/api/ledger'
import { paymentsApi, type PaymentBankDto } from '@/api/payments'
import { payoutsApi, type PayoutStatementDto } from '@/api/payouts'
import { queryKeys } from '@/queries/keys'
import type { Payment } from './pagos-mock-data'

/**
 * The shape every panel below reports in: never rows-without-their-error.
 *
 * `isLoading` is derived from react-query's `isPending`, NOT its `isLoading`.
 * `isLoading === isPending && isFetching`, so a query the client has PAUSED —
 * offline, under the default `networkMode: 'online'` — reports `isLoading: false`,
 * `isError: false`, `data: undefined`. That triple is indistinguishable from "the
 * request came back empty", and it is how a panel comes to assert that a
 * liquidación does not exist on the strength of a request that never left the
 * browser. `isPending` stays true until an answer actually arrives.
 */
export interface DetailQuery<T> {
  data: T | null
  isLoading: boolean
  isError: boolean
}

/**
 * Which running account a payment belongs to, or null when it has none.
 *
 * Mirrors `paymentLedgerEntity` in `apps/api/src/lib/ledger.ts` — the same
 * precedence, so the panel asks about the same counterparty the backend charged.
 * Gasto fijo, monotributo and plataforma resolve to null: they are money leaving
 * the studio with nobody on the other side holding a balance.
 */
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

/** Whether this payment could have a liquidación at all (a member, not a provider). */
export function hasPayoutStatement(payment: Payment): boolean {
  return (
    (payment.recipientType === 'collaborator' || payment.recipientType === 'employee') &&
    Boolean(payment.teamMemberId)
  )
}

/**
 * The member's liquidación for the payment's period.
 *
 * `(teamMemberId, period)` is unique server-side, so this is at most one statement
 * — and several payments to the same person in one month all resolve to it. That
 * is why the panel is labelled as the period's liquidación and not as this row's
 * breakdown.
 *
 * `data: null` with `isError: false` means the query ran and found none: the month
 * was never liquidated. The caller must say so rather than render an empty table.
 */
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

/**
 * The recipient's running account for the payment's month, IN THE PAYMENT'S OWN LANE.
 *
 * The ledger holds one running balance per (account, lane) and the summary figures close
 * only inside a lane. Asked unscoped, this panel would report the peso month beside a
 * dollar pago and label it that pago's account.
 */
/**
 * Did the SERVER honour the lane the statement was scoped to?
 *
 * During the deploy window it may not have: Deploy Web lands minutes before Deploy API,
 * and an older API drops the unknown `currency` query parameter silently, answering with
 * EVERY lane's entries. Rendering that under this pago's currency would relabel a
 * cross-lane sum as dollars — a wrong number stated confidently, which is worse than no
 * number, and the panel already has an honest "no pudimos cargar" state for that.
 *
 * `balancesMinor` is the tell: it exists only on a lane-aware server, and its schema
 * defaults to `{}` precisely for this window.
 *
 * THE PESO LANE NEEDS THE SAME PROOF. An earlier version exempted it on the premise that
 * "before lanes existed every row WAS pesos" — the exact claim migration 0027 exists to
 * refute. `POST /payments` has accepted `currency` since long before the column, and the
 * old `appendLedger` wrote one balance per account with no lane, so a provider owed both
 * pesos and dollars has ONE mixed running total on the deployed code. Asking for ARS and
 * rendering that answer as pesos is the same lie, in the lane most likely to be opened.
 *
 * An account with no entries at all returns `{}` from a NEW server too, so it reads as
 * unproven and shows the section's "no pudimos cargar" state instead of a zero. That is
 * the correct trade here: the alternative defaults an unknown to a confident figure.
 */
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
    // `period` is absent on an unscoped response; every call here is scoped, so
    // its absence would be a contract break, not an empty month — surfaced as null
    // rather than papered over with zeroes.
    data: laneScopeHonoured(query.data) ? (query.data?.period ?? null) : null,
    isLoading: enabled && query.isPending,
    isError: query.isError,
  }
}

/**
 * The recipient's banking details.
 *
 * A 403 here is expected for a role without `teamBankDetails` and surfaces as
 * `isError`, same as an outage — the panel says it could not load them either way,
 * which is the honest answer for a surface that must not guess.
 */
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
