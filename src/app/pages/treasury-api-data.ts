/**
 * Bridges the real Treasury accounts API to the front's `Account` shape. The API
 * carries two independent signed balances (ARS/USD) in MINOR units; the
 * front nests them in a partial `Money` map in MAJOR units (whole pesos). Updates
 * and deletes echo the optimistic-concurrency `version`.
 */
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

/** Map the raw API entity onto the front Account (only non-zero lanes populate Money). */
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

/** Shared body builder: both balances are ALWAYS sent (0 included) so a
 *  lane can be zeroed on edit and never lingers stale. */
function accountToInput(account: Omit<Account, 'id'>): CreateAccountInput {
  return {
    name: account.name,
    partner: account.partner,
    type: account.type,
    balanceArsMinor: majorToMinor(account.balances.ARS ?? 0),
    balanceUsdMinor: majorToMinor(account.balances.USD ?? 0),
    isReserve: account.isReserve ?? false,
    // The Activa switch: decides whether the balance is operating cash. Sent on create
    // and edit so it persists instead of snapping back after a success toast.
    isActive: account.isActive,
    // Always send note (empty string clears it) — the backend accepts '' and omitting
    // it would leave a stale note un-clearable on edit.
    note: (account.note ?? '').trim(),
  }
}

/** Load the workspace's treasury accounts from the API, mapped to the front shape. */
export async function fetchAccounts(): Promise<Account[]> {
  const rows = await treasuryApi.listAccounts()
  return rows.map(dtoToAccount)
}

/** Persist a new account and return it in the front shape. */
export async function createAccountViaApi(account: Omit<Account, 'id'>): Promise<Account> {
  return dtoToAccount(await treasuryApi.createAccount(accountToInput(account)))
}

/** Persist an edit to an account (echoing its version) and return the fresh row. */
export async function updateAccountViaApi(account: Account): Promise<Account> {
  const dto = await treasuryApi.updateAccount(account.id, {
    ...accountToInput(account),
    version: account.version ?? 0,
  })
  return dtoToAccount(dto)
}

/** Soft-delete an account (echoing its version). */
export async function deleteAccountViaApi(id: string, version: number): Promise<void> {
  await treasuryApi.deleteAccount(id, version)
}

// ── Commitments (forward register) ───────────────────────────────────────────
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

/** Map the raw commitment entity onto the front CommittedItem. Installments and
 *  reimbursement stay mock-only (no entry form yet); the entity link is real and
 *  round-trips, and the enum-ish string fields are narrowed to the front's unions.
 *
 *  A link is carried only when BOTH halves arrive and the type is one the front
 *  knows: a type it cannot resolve is worse than no link, because the projection
 *  would key a pool on a kind nothing ever matches. */
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

/** Shared body builder (create + update). direction/currency are set on create and
 *  immutable after; observations always sent so it can be cleared on edit. */
function commitmentToInput(item: Omit<CommittedItem, 'id'>): CreateCommitmentInput {
  return {
    description: item.description,
    direction: item.direction,
    amountMinor: majorToMinor(item.amount),
    currency: item.currency,
    category: item.category,
    recurrence: item.recurrence,
    startDate: item.startDate,
    // Always send endDate (null clears the horizon) so an edit can make a bounded
    // commitment open-ended, mirroring how observations/balances are always sent.
    endDate: item.endDate ?? null,
    anchorDay: item.anchorDay,
    confidence: item.confidence,
    observations: (item.observations ?? '').trim(),
    // The Activo switch: sent on create so an item created inactive stays out of the
    // projection (edit already carried it through updateCommitment).
    isActive: item.isActive,
    // Always sent as a PAIR, and always sent, so an edit can CLEAR a link by moving the
    // commitment to a category that names no entity. Omitting them on update would leave
    // a stale link pointing at a client on a row that is now a gasto fijo.
    linkedEntityType: item.linkedEntityType ?? null,
    linkedEntityId: item.linkedEntityId ?? null,
  }
}

/** Load the workspace's commitments from the API, mapped to the front shape. */
/**
 * What a cobro or a pago did to an account's balance, in pesos.
 *
 * PROVENANCE ONLY. These are already applied to the balances the Posición sums, so
 * nothing may add them on top — doing that is how a previous attempt at this reported a
 * position roughly a quarter of a million pesos higher than the studio actually had.
 */
export type SettlementMovement = {
  accountId: string
  direction: 'inflow' | 'outflow'
  lane: string
  amount: number
}

/** The movements since `from` (the position anchor: the date the balances are good as
 *  of). No anchor → nothing is asked for, because "since when" is the whole meaning. */
export async function fetchTreasuryMovements(from?: string): Promise<SettlementMovement[]> {
  if (!from) return []
  const res = await treasuryApi.listMovements(from)
  // `totals`, never `items`: the note is arithmetic and `items` is a paged audit read
  // that stops at the server's limit. Summing that page understated the movements by
  // however many rows it left behind, silently.
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

/** Persist a new commitment and return it in the front shape. */
export async function createCommitmentViaApi(
  item: Omit<CommittedItem, 'id'>,
): Promise<CommittedItem> {
  return dtoToCommitment(await treasuryApi.createCommitment(commitmentToInput(item)))
}

/** Persist a commitment edit (echoing version; direction/currency immutable). */
export async function updateCommitmentViaApi(item: CommittedItem): Promise<CommittedItem> {
  // isActive rides along inside `rest` (commitmentToInput now sends it), so it no longer
  // needs to be spelled out here.
  const { direction: _d, currency: _c, ...rest } = commitmentToInput(item)
  const dto = await treasuryApi.updateCommitment(item.id, {
    ...rest,
    version: item.version ?? 0,
  })
  return dtoToCommitment(dto)
}

/** Soft-delete a commitment (echoing its version). */
export async function deleteCommitmentViaApi(id: string, version: number): Promise<void> {
  await treasuryApi.deleteCommitment(id, version)
}
