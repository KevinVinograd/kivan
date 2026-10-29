import type { QueryClient, QueryKey } from '@tanstack/react-query'

import { onApiWrite, type ApiWriteListener } from '@/api/client'
import { queryKeys } from './keys'

export const DERIVED_READ_MODELS: readonly QueryKey[] = [
  queryKeys.reports.all,
  queryKeys.emitters.all,
  queryKeys.payouts.all,
  queryKeys.ledger.all,
  queryKeys.payments.all,
  queryKeys.clients.lists(),
  queryKeys.team.all,
]

const CLIENT_RECORD = /^\/clients\/[^/]+(\/status)?$/

export const WRITE_BURST_MS = 100

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
