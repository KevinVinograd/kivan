/** Auth resource calls — thin typed wrappers over the api client. */
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

/** The four capabilities the backend enforces (mirrors @hold/shared's Capability union). */
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
  // Effective capabilities for this session (built-in role narrowed by any custom role).
  // Optional so a response minted before the engine (mid-deploy) still parses; the caller
  // falls back to role-derived capabilities in that case, never to an empty (hide-all) set.
  capabilities: z.array(CapabilitySchema).optional(),
  // The assigned custom role's grant keys, or null when governed by the built-in role.
  // `.nullish()` so a pre-engine response (field absent) reads as null = built-in governs.
  permissions: z.array(z.string()).nullish(),
})
export type Me = z.infer<typeof MeSchema>

/** What the invited person tells us about THEMSELVES. Not role, rates or capacity — those
 *  are the studio's to decide, and the API refuses them here. */
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
    // Recordarme: true → persist across browser restarts, false → session-only (cleared on close).
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
  /**
   * Request a password-reset link for an email. The server (`POST /auth/forgot-password`)
   * is enumeration-safe — always 204 whether or not the email exists — so callers should
   * stay best-effort and show the same confirmation regardless of outcome. Returns nothing:
   * the reset link is delivered by email.
   */
  requestPasswordReset: (email: string) =>
    apiClient.post<void>('/auth/forgot-password', { email }),
  /**
   * Consume a member invitation: set the password + activate the account. Public
   * (pre-auth) — the token comes from the emailed one-time link. 204 on success,
   * uniform 401 on a missing / used / expired token.
   */
  acceptInvitation: (token: string, password: string, profile?: InvitedProfile) =>
    apiClient.post<void>('/auth/accept-invitation', {
      token,
      password,
      ...(profile ? { profile } : {}),
    }),
  /**
   * What the set-password screen may know BEFORE anyone signs in: a first name to greet
   * with, and whether to ask this person to complete their ficha. Does NOT consume the
   * token. `needsProfile` is false for a password reset — the same screen serves both, and
   * somebody recovering their password must not be marched through onboarding.
   */
  invitationPreview: (token: string) =>
    // POST for a pure read: the token must NOT ride in the URL. `req.url` is logged verbatim
    // server-side, and this token is a live account-takeover credential.
    apiClient.post<InvitationPreview>(
      '/auth/invitation/preview',
      { token },
      { schema: InvitationPreviewSchema },
    ),
  /**
   * Revoke the current refresh token server-side on sign-out. Reads the stored token here
   * (the api layer owns token access, like `login` owns `setTokens`) so React code never
   * imports a raw token getter. Best-effort: the caller's local clear happens regardless, so
   * do NOT block sign-out on this. No token stored → nothing to revoke. Idempotent; 204.
   */
  logout: () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return Promise.resolve()
    return apiClient.post<void>('/auth/logout', { refreshToken })
  },
}
