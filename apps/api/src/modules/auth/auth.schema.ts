import { z } from 'zod';
import { invitedProfileSchema } from '../team/team.schema.js';
import type { Capability, Role } from '@hold/shared';
import { emailSchema } from '../../lib/email.js';

export const loginSchema = z.object({
  // Trimmed + lowercased like every other email edge. Without the trim, an address
  // pasted with a trailing space failed `.email()` and came back 400 "Validation failed"
  // — which reads as "your email is malformed" for what is an invisible character.
  // Lowercasing is safe because the lookup matches case-insensitively anyway.
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(512),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

// Public self-service password reset request. Email is trimmed + lowercased like login.
export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// Public set-password: the member consumes their invitation token to set a
// password and activate the account. Same min length as a password change.
export const acceptInvitationSchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(8).max(200),
  // The ficha the person fills in about themselves. Its shape belongs to the `team` module,
  // which owns the ficha — auth owns consuming the token, not what a member looks like.
  // Absent for a password RESET (the same route serves both) and for a login with no roster
  // person behind it. Present only when there is actually a ficha to complete.
  profile: invitedProfileSchema.optional(),
});

/**
 * `POST /auth/invitation/preview` — what the set-password screen may know BEFORE anyone
 * authenticates: a first name to greet with, and whether to ask for the profile. No email,
 * no role, no workspace.
 *
 * A POST that reads nothing, on purpose. The token is a one-time credential good for taking
 * over the invited account, and Fastify logs `req.url` verbatim on every request — the
 * redact list covers `token` as an object path, which a query string is not. In the query
 * string it would be written to the API logs and to Caddy's; in the body it is redacted.
 */
export const invitationPreviewSchema = z.object({
  token: z.string().min(1).max(512),
});
export interface InvitationPreviewDto {
  firstName: string;
  /** True only for a FIRST-TIME invite of someone linked to a roster person. A password
   *  reset (already-active user) and an unlinked login both get false — neither has a ficha
   *  this flow should be filling in. */
  needsProfile: boolean;
}
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export interface AuthTokensDto {
  accessToken: string;
  tokenType: 'Bearer';
  refreshToken: string;
  expiresIn: string;
}

export interface MeDto {
  userId: string;
  role: Role;
  teamMemberId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  /** Effective capabilities for this session (built-in role narrowed by any custom role). */
  capabilities: Capability[];
  /** Assigned custom role's grant keys, or null when governed by the built-in role. */
  permissions: string[] | null;
}
