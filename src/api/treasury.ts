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

export interface CreateAccountInput {
  name: string
  partner?: string
  type?: string
  balanceArsMinor?: string
  balanceUsdMinor?: string
  isReserve?: boolean
  isActive?: boolean
  note?: string
}

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
  linkedEntityType: string | null
  linkedEntityId: string | null
}

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
  isActive?: boolean
  linkedEntityType?: string | null
  linkedEntityId?: string | null
}

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

export interface TreasuryMovementDto {
  id: string
  accountId: string
  date: string
  direction: string
  lane: string
  amountMinor: string
  description: string
  referenceType: string | null
  referenceId: string | null
}

export interface TreasuryMovementTotalDto {
  accountId: string
  lane: string
  direction: string
  amountMinor: string
}

export const treasuryApi = {
  listAccounts: () => apiClient.get<TreasuryAccountDto[]>('/treasury/accounts'),
  listMovements: (from?: string) =>
    apiClient.get<{ items: TreasuryMovementDto[]; totals: TreasuryMovementTotalDto[] }>(
      '/treasury/movements',
      from ? { params: { from } } : undefined,
    ),
  createAccount: (input: CreateAccountInput) =>
    apiClient.post<TreasuryAccountDto>('/treasury/accounts', input),
  updateAccount: (id: string, input: UpdateAccountInput) =>
    apiClient.put<TreasuryAccountDto>(`/treasury/accounts/${id}`, input),
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
