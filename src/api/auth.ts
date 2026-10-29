import { z } from 'zod'
import { Role } from '@hold/shared'
import { apiClient } from './client'
import { getRefreshToken, setTokens } from './token'

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  tokenType: z.string(),
  refreshToken: z.string(),
  expiresIn: z.string(),
})
export type AuthTokens = z.infer<typeof AuthTokensSchema>

export const CapabilitySchema = z.enum([
  'profitability',
  'studioFinancials',
  'teamCost',
  'teamBankDetails',
])

export const MeSchema = z.object({
  userId: z.string(),
  role: Role,
  teamMemberId: z.string().nullable(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  capabilities: z.array(CapabilitySchema).optional(),
  permissions: z.array(z.string()).nullish(),
})
export type Me = z.infer<typeof MeSchema>

export interface InvitedProfile {
  phone?: string
  taxId?: string
  bankName?: string
  accountHolder?: string
  cbuOrCvu?: string
  bankAlias?: string
}

export const InvitationPreviewSchema = z.object({
  firstName: z.string(),
  needsProfile: z.boolean(),
})
export type InvitationPreview = z.infer<typeof InvitationPreviewSchema>

export const authApi = {
  async login(
    email: string,
    password: string,
    remember = true,
  ): Promise<AuthTokens> {
    const tokens = await apiClient.post<AuthTokens>(
      '/auth/login',
      { email, password },
      { schema: AuthTokensSchema },
    )
    setTokens(tokens.accessToken, tokens.refreshToken, remember)
    return tokens
  },
  me: () => apiClient.get<Me>('/auth/me', { schema: MeSchema }),
  requestPasswordReset: (email: string) =>
    apiClient.post<void>('/auth/forgot-password', { email }),
  acceptInvitation: (token: string, password: string, profile?: InvitedProfile) =>
    apiClient.post<void>('/auth/accept-invitation', {
      token,
      password,
      ...(profile ? { profile } : {}),
    }),
  invitationPreview: (token: string) =>
    apiClient.post<InvitationPreview>(
      '/auth/invitation/preview',
      { token },
      { schema: InvitationPreviewSchema },
    ),
  logout: () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return Promise.resolve()
    return apiClient.post<void>('/auth/logout', { refreshToken })
  },
}
