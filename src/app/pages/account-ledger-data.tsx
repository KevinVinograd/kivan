import { useMemo } from 'react'

import { allLedgerEntries, teamMemberName } from './account-ledger-mock-data'
import { entityFromEntries, statementsForEntity } from './account-ledger-format'
import type { AccountEntity, LedgerEntityType, PeriodStatement } from './account-ledger-types'
import { useReceivables } from './receivables-data'
import { usePayments } from './payments-data'
import { useTeamData } from './team-data'

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

  const nameFor = (type: LedgerEntityType, entityId: string): string =>
    type === 'teamMember' ? teamMemberName(team.members, entityId) : entityId

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
