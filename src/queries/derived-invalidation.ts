import type { QueryClient, QueryKey } from '@tanstack/react-query'

import { onApiWrite, type ApiWriteListener } from '@/api/client'
import { queryKeys } from './keys'

/**
 * Read models that a write ANYWHERE can change, so no write site is trusted to remember them.
 *
 * Reports, margins, the monotributo's monthly usage, payout statements and outstanding
 * payroll, the ledgers, bank details and the pickers are all computed from rows that many
 * screens write. Each one used to be invalidated by the one or two writes someone thought of
 * (often none), so after any other write it showed the old figure for up to its staleTime,
 * and for as long as the page stayed open. Found 22/10 auditing cross-screen staleness.
 *
 * Deliberately NOT here: `receivables` and `treasury`, which reconcile their own writes into
 * the cache (and the receivables cache still holds session-only edits a refetch would drop),
 * and `users` / `roles` / `workspace` / `notifications` / `auth`, whose only writers already
 * invalidate them.
 */
export const DERIVED_READ_MODELS: readonly QueryKey[] = [
  queryKeys.reports.all,
  queryKeys.emitters.all,
  queryKeys.payouts.all,
  queryKeys.ledger.all,
  queryKeys.payments.all,
  queryKeys.clients.lists(),
  queryKeys.team.all,
]

/** A client's own record changed: the cobros carry its name, razón social and CUIT. */
const CLIENT_RECORD = /^\/clients\/[^/]+(\/status)?$/

/** Writes inside one burst (a bulk approval, a generated month) collapse into one pass. */
export const WRITE_BURST_MS = 100

/**
 * Wire `queryClient` to every confirmed write; returns the unsubscribe. Invalidation refetches
 * what is on screen and marks the rest stale for its next mount.
 */
export function invalidateDerivedOnWrite(queryClient: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let clientRecordChanged = false
  const flush = () => {
    timer = null
    for (const queryKey of DERIVED_READ_MODELS) void queryClient.invalidateQueries({ queryKey })
    if (clientRecordChanged) void queryClient.invalidateQueries({ queryKey: queryKeys.receivables.all })
    clientRecordChanged = false
  }
  const listener: ApiWriteListener = ({ path }) => {
    if (CLIENT_RECORD.test(path)) clientRecordChanged = true
    if (timer === null) timer = setTimeout(flush, WRITE_BURST_MS)
  }
  const unsubscribe = onApiWrite(listener)
  return () => {
    unsubscribe()
    if (timer !== null) clearTimeout(timer)
  }
}
