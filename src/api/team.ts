/** Team members (Equipo) resource calls — thin typed wrappers over the api client. */
import { apiClient } from './client'

/** Raw TeamMember entity as `GET /team-members` returns it. Money is minor units. */
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
  /** Derived: bank details complete enough to pay (holder + CBU/CVU). Not the fields —
   *  those come from the capability-gated bank sub-resource. */
  bankComplete: boolean
  /** Same derivation, three-valued: `none` = nothing on file, `incomplete` = something on
   *  file but no holder or CBU/CVU. */
  bankStatus: 'complete' | 'incomplete' | 'none'
  createdAt: string
}

export interface PaginatedTeamDto {
  items: TeamMemberDto[]
  total: number
  limit: number
  offset: number
}

/** Body for `POST /team-members`. Money (rates) in minor units (string). */
export interface CreateTeamMemberInput {
  name: string
  role: string
  /** Roster lifecycle: 'active' | 'paused' | 'inactive'. */
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

/** Body for `PUT /team-members/:id` — same shape, at least one field. */
export type UpdateTeamMemberInput = Partial<CreateTeamMemberInput>

/** A member's bank details, served ONLY through the capability-gated bank sub-resource. */
export interface BankDto {
  bankName: string | null
  accountHolder: string | null
  cbuOrCvu: string | null
  alias: string | null
}

/** `PUT /team-members/:id/bank` body — flattened; '' clears a field, omitted leaves it. */
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
  // Bank details — capability-gated (requireCapability('teamBankDetails')). 403 for a role
  // without the capability, so callers must gate the UI on can(role, 'teamBankDetails').
  getBank: (id: string) => apiClient.get<BankDto | null>(`/team-members/${id}/bank`),
  updateBank: (id: string, input: BankDetailsInput) =>
    apiClient.put<BankDto | null>(`/team-members/${id}/bank`, input),
}
