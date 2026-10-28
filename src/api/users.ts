/** Workspace users (Settings → Miembros) — thin typed wrappers over the api client. */
import { z } from 'zod'

import { apiClient } from './client'

/** `GET /users` (owner + admin). The people with access to the workspace. */
export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(),
  status: z.string(),
  teamMemberId: z.string().nullable(),
  /** Assigned custom WorkspaceRole id, or null when only the built-in role applies. */
  workspaceRoleId: z.string().nullable(),
})
export type UserDto = z.infer<typeof UserSchema>

export const UsersSchema = z.array(UserSchema)

/** Roles a workspace member can be created with / moved to. Ownership is not one of
 *  them: it moves through the dedicated transfer flow (`transferOwnership`), never a
 *  plain role change, so the workspace can never end up with two owners or none. */
export type AssignableUserRole = 'admin' | 'employee'

/** `POST /users` body. Email-invite flow: the member sets their OWN password via the
 *  one-time link, so no password is sent here. */
export interface CreateUserInput {
  email: string
  firstName: string
  lastName: string
  role: AssignableUserRole
  /** Optionally link this login to a roster person (`TeamMember`). Sets `me.teamMemberId`,
   *  which is what resolves the employee self-view. */
  teamMemberId?: string
}

/** `POST /users` response: the created member + the set-password link and whether the
 *  invitation email actually went out (false → hand the link over on-screen). */
export const InviteResultSchema = z.object({
  user: UserSchema,
  invite: z.object({ link: z.string(), mailed: z.boolean() }),
})
export type InviteResult = z.infer<typeof InviteResultSchema>

export const usersApi = {
  list: () => apiClient.get<UserDto[]>('/users', { schema: UsersSchema }),
  create: (input: CreateUserInput) =>
    apiClient.post<InviteResult>('/users', input, { schema: InviteResultSchema }),
  changeRole: (id: string, role: AssignableUserRole) =>
    apiClient.patch<UserDto>(`/users/${id}/role`, { role }, { schema: UserSchema }),
  /** Deactivate / reactivate a member. Disabling ends their sessions and blocks login. */
  changeStatus: (id: string, status: 'active' | 'disabled') =>
    apiClient.patch<UserDto>(`/users/${id}/status`, { status }, { schema: UserSchema }),
  /** Send a locked-out member a password-reset link (owner/admin). Mints a one-time
   *  set-password token and emails it; the member chooses their own new password. Returns
   *  the link + whether the mail went out (false → hand the link over on-screen). */
  sendPasswordReset: (id: string) =>
    apiClient.post<ResetResult>(`/users/${id}/password-reset`, undefined, { schema: ResetResultSchema }),
  /** Hand the owner seat to member `id` (owner-only). The current owner steps down to
   *  admin in the same transaction, so the caller must refresh its own session after. */
  transferOwnership: (id: string) =>
    apiClient.post<UserDto>(`/users/${id}/transfer-ownership`, undefined, { schema: UserSchema }),
}

/** `POST /users/:id/password-reset` response: the one-time link + whether mail was sent. */
// `link` is absent whenever the mail went out: the server withholds the one-time token
// rather than put a credential in a response body, and this branch never needs it.
export const ResetResultSchema = z.object({ link: z.string().optional(), mailed: z.boolean() })
export type ResetResult = z.infer<typeof ResetResultSchema>
