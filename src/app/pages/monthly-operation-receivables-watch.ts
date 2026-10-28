/**
 * The rule that decides when the monthly plan bundle must be re-read because the
 * canonical receivables store changed underneath it.
 *
 * `MonthlyOperationProvider` fetches `GET /months/:period/plan` once per selected month.
 * A cobro registered, edited, cancelled or generated on `/cobros` or `/billing` lands in
 * `ReceivablesProvider` instead — a separate fetch-once store that reconciles its own
 * cache and notifies nothing else. So the bundle keeps serving the snapshot taken at app
 * start, and `/dashboard` § Pendientes críticos goes on listing a client whose cobro was
 * just collected as "sin cobro registrado" until a full page reload.
 *
 * Pure and in its own module so the node-environment unit project can test it: the
 * provider that consumes it is a `.tsx` that pulls in React, the API client and the
 * component barrel, none of which that project can load.
 */

/** What the caller must remember between observations: the last cache timestamp seen. */
export type ReceivablesWatch = {
  /** The receivables cache timestamp this watcher has already accounted for. */
  seen: number
  /** Whether the bundle must be re-read as a result of this observation. */
  refresh: boolean
}

/**
 * Fold one `dataUpdatedAt` observation into the watcher.
 *
 * `dataUpdatedAt` advances on a `setQueryData` reconcile as well as on a fetch, so this
 * covers every receivables write path without the monthly store having to know any of
 * them.
 *
 * Two observations deliberately do NOT refresh:
 * - `updatedAt === 0`: the receivables store has not loaded yet, so there is nothing the
 *   bundle could be behind.
 * - the FIRST advance (`seen === 0`): that is the store's initial load, which the bundle's
 *   own initial load raced on equal terms. Refreshing there would cost a second
 *   `GET /months/:period/plan` on every single app start, for a bundle already current.
 */
export function nextReceivablesWatch(seen: number, updatedAt: number): ReceivablesWatch {
  if (updatedAt === 0) return { seen, refresh: false }
  if (seen === 0) return { seen: updatedAt, refresh: false }
  // `>` and not `!==`: a timestamp that moved backwards is not a new write, and adopting
  // it would leave the watcher primed to refresh on a stale value it had already seen.
  if (updatedAt <= seen) return { seen, refresh: false }
  return { seen: updatedAt, refresh: true }
}
