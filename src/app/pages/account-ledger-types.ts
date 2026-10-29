import type { Currency } from '@hold/shared'

import type { CollectionStatus } from './cobros-mock-data'
import type { TeamPaymentStatus } from './team-mock-data'

export type LedgerEntityType = 'client' | 'teamMember' | 'provider'

export type LedgerEntry = {
  id: string
  entityType: LedgerEntityType
  entityId: string
  period: string
  type: 'charge' | 'collection' | 'generated' | 'payment' | 'adjustment'
  referenceId?: string
  invoiceNumber?: string
  description: string
  note?: string
  debit: number
  credit: number
  currency: Currency
  balance: number
  date: string
}

export type AccountStatus = CollectionStatus | TeamPaymentStatus

export type AccountEntity = {
  entityType: LedgerEntityType
  entityId: string
  name: string
  currentBalance: number
  otherLaneCount: number
  status: AccountStatus
  lastMovementAt?: string
}

export type PeriodStatement = {
  period: string
  charged: number
  settled: number
  balance: number
  otherLaneCount: number
  status: AccountStatus
  dueDate?: string
  reference?: string
  notes?: string
  movements: LedgerEntry[]
}
