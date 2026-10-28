/** Treasury accounts resource calls — thin typed wrappers over the api client.
 *  Money is integer MINOR units (signed) serialized as strings; updates/deletes
 *  carry the optimistic-concurrency `version` the caller last read. */
import { apiClient } from './client'

export interface TreasuryAccountDto {
  id: string
  name: string
  partner: string
  type: string
  balanceArsMinor: string
  balanceUsdMinor: string
  isReserve: boolean
  note: string | null
  isActive: boolean
  version: number
}

/** Body for `POST /treasury/accounts`. Balances are signed minor units (strings). */
export interface CreateAccountInput {
  name: string
  partner?: string
  type?: string
  balanceArsMinor?: string
  balanceUsdMinor?: string
  isReserve?: boolean
  /** Whether the balance counts as operating cash (drives the Posición total + projection
   *  opening). Sent so the Activa switch actually persists. */
  isActive?: boolean
  note?: string
}

/** Body for `PUT /treasury/accounts/:id` — must echo the read `version`. */
export interface UpdateAccountInput extends Partial<CreateAccountInput> {
  version: number
}

export interface CommittedItemDto {
  id: string
  description: string
  direction: string
  amountMinor: string
  currency: string
  category: string | null
  recurrence: string
  startDate: string
  endDate: string | null
  anchorDay: number
  confidence: string
  source: string
  observations: string | null
  isActive: boolean
  version: number
  /** The entity this commitment realizes: `client` | `teamMember` | `provider`, or
   *  null when it names none (a fixed expense, a monotributo cuota, a platform). */
  linkedEntityType: string | null
  linkedEntityId: string | null
}

/** Body for `POST /treasury/commitments`. amount is non-negative minor units (string). */
export interface CreateCommitmentInput {
  description: string
  direction: string
  amountMinor: string
  currency?: string
  category?: string
  recurrence?: string
  startDate: string
  endDate?: string | null
  anchorDay?: number
  confidence?: string
  observations?: string
  /** Whether the commitment enters the projection. Sent on create so an item created
   *  inactive stays out (edit already carried it). */
  isActive?: boolean
  /** The link travels as a PAIR: send both or neither. Both null clears it. The API
   *  rejects a half-sent pair (400) and an id that names no row in this workspace. */
  linkedEntityType?: string | null
  linkedEntityId?: string | null
}

/** Body for `PUT /treasury/commitments/:id` — echoes version; direction/currency immutable. */
export interface UpdateCommitmentInput {
  version: number
  description?: string
  amountMinor?: string
  category?: string
  recurrence?: string
  startDate?: string
  endDate?: string | null
  anchorDay?: number
  confidence?: string
  observations?: string
  isActive?: boolean
  linkedEntityType?: string | null
  linkedEntityId?: string | null
}

/** One automatic balance movement — what a cobro or a pago did to an account. */
export interface TreasuryMovementDto {
  id: string
  accountId: string
  /** The calendar day the money moved (date-only, already a day). */
  date: string
  direction: string
  lane: string
  amountMinor: string
  description: string
  referenceType: string | null
  referenceId: string | null
}

/** What the movements add up to per account / lane / direction. The Saldos note reads
 *  THIS and not `items`: `items` stops at the server's page limit, and a sum over a page
 *  that stopped short is a wrong figure on the screen that explains the money. */
export interface TreasuryMovementTotalDto {
  accountId: string
  lane: string
  direction: string
  amountMinor: string
}

export const treasuryApi = {
  listAccounts: () => apiClient.get<TreasuryAccountDto[]>('/treasury/accounts'),
  /** What has moved the balances on their own since `from` (normally the position
   *  anchor). PROVENANCE ONLY — the movements are already inside the balances, so
   *  nothing may add them to the position on top. */
  listMovements: (from?: string) =>
    apiClient.get<{ items: TreasuryMovementDto[]; totals: TreasuryMovementTotalDto[] }>(
      '/treasury/movements',
      from ? { params: { from } } : undefined,
    ),
  createAccount: (input: CreateAccountInput) =>
    apiClient.post<TreasuryAccountDto>('/treasury/accounts', input),
  updateAccount: (id: string, input: UpdateAccountInput) =>
    apiClient.put<TreasuryAccountDto>(`/treasury/accounts/${id}`, input),
  // The version guard rides in the query string for DELETE (not the body).
  deleteAccount: (id: string, version: number) =>
    apiClient.delete<{ deleted: boolean }>(`/treasury/accounts/${id}`, {
      params: { version },
    }),
  listCommitments: () => apiClient.get<CommittedItemDto[]>('/treasury/commitments'),
  createCommitment: (input: CreateCommitmentInput) =>
    apiClient.post<CommittedItemDto>('/treasury/commitments', input),
  updateCommitment: (id: string, input: UpdateCommitmentInput) =>
    apiClient.put<CommittedItemDto>(`/treasury/commitments/${id}`, input),
  deleteCommitment: (id: string, version: number) =>
    apiClient.delete<{ deleted: boolean }>(`/treasury/commitments/${id}`, {
      params: { version },
    }),
}
