import {
  treasuryApi,
  type CommittedItemDto,
  type CreateAccountInput,
  type CreateCommitmentInput,
  type TreasuryAccountDto,
} from '@/api/treasury'
import type {
  Account,
  CommittedCategory,
  CommittedItem,
  Currency,
  LinkedEntityType,
  Money,
  Partner,
} from './treasury-mock-data'

const minorToMajor = (minor: string): number => Number(minor) / 100
const majorToMinor = (major: number): string => String(Math.round(major * 100))

export function dtoToAccount(d: TreasuryAccountDto): Account {
  const balances: Money = {}
  const ars = minorToMajor(d.balanceArsMinor)
  const usd = minorToMajor(d.balanceUsdMinor)
  if (ars !== 0) balances.ARS = ars
  if (usd !== 0) balances.USD = usd
  return {
    id: d.id,
    name: d.name,
    partner: d.partner as Partner,
    type: d.type as Account['type'],
    balances,
    isReserve: d.isReserve || undefined,
    note: d.note ?? undefined,
    isActive: d.isActive,
    version: d.version,
  }
}

function accountToInput(account: Omit<Account, 'id'>): CreateAccountInput {
  return {
    name: account.name,
    partner: account.partner,
    type: account.type,
    balanceArsMinor: majorToMinor(account.balances.ARS ?? 0),
    balanceUsdMinor: majorToMinor(account.balances.USD ?? 0),
    isReserve: account.isReserve ?? false,
    isActive: account.isActive,
    note: (account.note ?? '').trim(),
  }
}

export async function fetchAccounts(): Promise<Account[]> {
  const rows = await treasuryApi.listAccounts()
  return rows.map(dtoToAccount)
}

export async function createAccountViaApi(account: Omit<Account, 'id'>): Promise<Account> {
  return dtoToAccount(await treasuryApi.createAccount(accountToInput(account)))
}

export async function updateAccountViaApi(account: Account): Promise<Account> {
  const dto = await treasuryApi.updateAccount(account.id, {
    ...accountToInput(account),
    version: account.version ?? 0,
  })
  return dtoToAccount(dto)
}

export async function deleteAccountViaApi(id: string, version: number): Promise<void> {
  await treasuryApi.deleteAccount(id, version)
}

const CATEGORIES: readonly string[] = [
  'salaries',
  'fixed_expense',
  'tax',
  'platform',
  'retainer',
  'other',
]
const RECURRENCES: readonly string[] = ['monthly', 'quarterly', 'annual', 'one_time']
const CONFIDENCES: readonly string[] = ['committed', 'projected']

const ENTITY_TYPES: readonly string[] = ['client', 'teamMember', 'provider']

export function dtoToCommitment(d: CommittedItemDto): CommittedItem {
  return {
    id: d.id,
    description: d.description,
    direction: d.direction === 'inflow' ? 'inflow' : 'outflow',
    amount: minorToMajor(d.amountMinor),
    currency: d.currency as Currency,
    category: (CATEGORIES.includes(d.category ?? '') ? d.category : 'other') as CommittedCategory,
    recurrence: (RECURRENCES.includes(d.recurrence)
      ? d.recurrence
      : 'monthly') as CommittedItem['recurrence'],
    startDate: d.startDate,
    endDate: d.endDate ?? undefined,
    anchorDay: d.anchorDay,
    confidence: (CONFIDENCES.includes(d.confidence)
      ? d.confidence
      : 'committed') as CommittedItem['confidence'],
    source: d.source === 'derived' ? 'derived' : 'manual',
    ...(d.linkedEntityId && d.linkedEntityType && ENTITY_TYPES.includes(d.linkedEntityType)
      ? {
          linkedEntityType: d.linkedEntityType as LinkedEntityType,
          linkedEntityId: d.linkedEntityId,
        }
      : {}),
    observations: d.observations ?? undefined,
    isActive: d.isActive,
    version: d.version,
  }
}

function commitmentToInput(item: Omit<CommittedItem, 'id'>): CreateCommitmentInput {
  return {
    description: item.description,
    direction: item.direction,
    amountMinor: majorToMinor(item.amount),
    currency: item.currency,
    category: item.category,
    recurrence: item.recurrence,
    startDate: item.startDate,
    endDate: item.endDate ?? null,
    anchorDay: item.anchorDay,
    confidence: item.confidence,
    observations: (item.observations ?? '').trim(),
    isActive: item.isActive,
    linkedEntityType: item.linkedEntityType ?? null,
    linkedEntityId: item.linkedEntityId ?? null,
  }
}

export type SettlementMovement = {
  accountId: string
  direction: 'inflow' | 'outflow'
  lane: string
  amount: number
}

export async function fetchTreasuryMovements(from?: string): Promise<SettlementMovement[]> {
  if (!from) return []
  const res = await treasuryApi.listMovements(from)
  return res.totals.map((item) => ({
    accountId: item.accountId,
    direction: item.direction === 'outflow' ? 'outflow' : 'inflow',
    lane: item.lane,
    amount: minorToMajor(item.amountMinor),
  }))
}

export async function fetchCommitments(): Promise<CommittedItem[]> {
  const rows = await treasuryApi.listCommitments()
  return rows.map(dtoToCommitment)
}

export async function createCommitmentViaApi(
  item: Omit<CommittedItem, 'id'>,
): Promise<CommittedItem> {
  return dtoToCommitment(await treasuryApi.createCommitment(commitmentToInput(item)))
}

export async function updateCommitmentViaApi(item: CommittedItem): Promise<CommittedItem> {
  const { direction: _d, currency: _c, ...rest } = commitmentToInput(item)
  const dto = await treasuryApi.updateCommitment(item.id, {
    ...rest,
    version: item.version ?? 0,
  })
  return dtoToCommitment(dto)
}

export async function deleteCommitmentViaApi(id: string, version: number): Promise<void> {
  await treasuryApi.deleteCommitment(id, version)
}
