import { apiClient } from './client'

export interface TeamMemberDto {
  id: string
  name: string
  role: string
  status: string
  employmentType: string
  compensationModel: string
  currency: string
  hourlyRateMinor: string | null
  monthlyAmountMinor: string | null
  productionRateMinor: string | null
  taxId: string | null
  email: string | null
  phone: string | null
  notes: string | null
  startDate: string | null
  bankComplete: boolean
  bankStatus: 'complete' | 'incomplete' | 'none'
  createdAt: string
}

export interface PaginatedTeamDto {
  items: TeamMemberDto[]
  total: number
  limit: number
  offset: number
}

export interface CreateTeamMemberInput {
  name: string
  role: string
  status?: string
  employmentType?: string
  compensationModel?: string
  currency?: string
  hourlyRateMinor?: string
  monthlyAmountMinor?: string
  productionRateMinor?: string
  taxId?: string
  email?: string
  phone?: string
  notes?: string
  startDate?: string
}

export type UpdateTeamMemberInput = Partial<CreateTeamMemberInput>

export interface BankDto {
  bankName: string | null
  accountHolder: string | null
  cbuOrCvu: string | null
  alias: string | null
}

export interface BankDetailsInput {
  bankName?: string
  accountHolder?: string
  cbuOrCvu?: string
  bankAlias?: string
}

export const teamApi = {
  list: (params?: { limit?: number; offset?: number }) =>
    apiClient.get<PaginatedTeamDto>('/team-members', params ? { params } : undefined),
  create: (input: CreateTeamMemberInput) => apiClient.post<TeamMemberDto>('/team-members', input),
  update: (id: string, input: UpdateTeamMemberInput) =>
    apiClient.put<TeamMemberDto>(`/team-members/${id}`, input),
  deactivate: (id: string) => apiClient.post<TeamMemberDto>(`/team-members/${id}/deactivate`, {}),
  getBank: (id: string) => apiClient.get<BankDto | null>(`/team-members/${id}/bank`),
  updateBank: (id: string, input: BankDetailsInput) =>
    apiClient.put<BankDto | null>(`/team-members/${id}/bank`, input),
}
