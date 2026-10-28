import { useMemo } from 'react'

import { allLedgerEntries, teamMemberName } from './account-ledger-mock-data'
import { entityFromEntries, statementsForEntity } from './account-ledger-format'
import type { AccountEntity, LedgerEntityType, PeriodStatement } from './account-ledger-types'
import { useReceivables } from './receivables-data'
import { usePayments } from './payments-data'
import { useTeamData } from './team-data'

/**
 * Reads the derived account ledger and rolls it up for the Cuentas corrientes
 * page: the master entity list per type, and a single entity's period statement.
 * Every ledger (client, colaboradora, proveedor) derives from its live store
 * (Receivables / Team / Payments), so a cobro, pago, or team payment registered
 * on /cobros, /billing, /pagos or /team is reflected here.
 *
 * The three stores' load state is composed and re-exposed, because this page's three
 * tabs each derive from a DIFFERENT store: clients from Receivables, colaboradoras from
 * Team, proveedores from Payments. A failure in any one of them empties the ledger it
 * feeds, so the page must be able to tell "this counterparty has no movements" apart
 * from "we could not load" — otherwise a money surface reports a false zero
 *.
 */
export function useAccountLedger() {
  const receivablesStore = useReceivables()
  const paymentsStore = usePayments()
  const team = useTeamData()
  const { receivables } = receivablesStore
  const { payments } = paymentsStore
  const entries = useMemo(
    () => allLedgerEntries(receivables, payments, team),
    [receivables, payments, team],
  )

  // Clients and proveedores key by name already (their entityId IS the name);
  // only colaboradoras need a roster lookup to resolve the id to a display name.
  const nameFor = (type: LedgerEntityType, entityId: string): string =>
    type === 'teamMember' ? teamMemberName(team.members, entityId) : entityId

  // Distinct entity ids are derived from the already-memoized `entries`, so the
  // ledger is not re-derived per call.
  const entitiesByType = (type: LedgerEntityType): AccountEntity[] => {
    const ids = [
      ...new Set(entries.filter((entry) => entry.entityType === type).map((entry) => entry.entityId)),
    ]
    return ids
      .map((id) => entityFromEntries(entries, id, type, nameFor(type, id)))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  const statementFor = (entityId: string): PeriodStatement[] =>
    statementsForEntity(entries, entityId)

  /**
   * Load state SCOPED TO ONE ENTITY TYPE, because each tab derives from exactly one
   * store: clients ← Receivables, colaboradoras ← Team, proveedores ← Payments
   * (`account-ledger-mock-data.ts`). Composing the three with `||` would be wrong twice
   * over: one degraded store would black out the two tabs that loaded perfectly well,
   * and — worse — the resulting retry would re-fetch the HEALTHY stores too.
   *
   * That last part is not hypothetical. Receivables holds client-only edits with no
   * endpoint yet (asociar/enviar factura, datos fiscales), which is exactly why it sets
   * `staleTime: Infinity` and disables every auto-refetch: a re-fetch DISCARDS them. So
   * a blanket retry on a Team outage would silently destroy a factura association made
   * on /billing. Scoping the status per tab means the retry only ever touches the store
   * that actually failed — a healthy store has nothing to retry.
   *
   * `isFetching` (not `isLoading`) for the react-query store: it holds `status === 'error'`
   * across a refetch, so a retry driven off `isLoading` alone would leave the error on
   * screen with no feedback (, which also fixes the loading-before-
   * error order).
   */
  const statusFor = (type: LedgerEntityType) => {
    switch (type) {
      case 'client':
        return {
          isLoading: receivablesStore.isFetching,
          isError: receivablesStore.isError,
          refetch: receivablesStore.refetch,
        }
      case 'teamMember':
        return { isLoading: team.isLoading, isError: team.isError, refetch: team.refetch }
      case 'provider':
        return {
          isLoading: paymentsStore.isLoading,
          isError: paymentsStore.isError,
          refetch: paymentsStore.refetch,
        }
    }
  }

  return { entitiesByType, statementFor, statusFor }
}
