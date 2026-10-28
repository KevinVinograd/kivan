/** The signed-in person's own account (`/me/*`) — thin typed wrappers over the api client. */
import { apiClient } from './client'

import { UserSchema, type UserDto } from './users'

export interface UpdateProfileInput {
  firstName?: string
  lastName?: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export const profileApi = {
  get: () => apiClient.get<UserDto>('/me/profile', { schema: UserSchema }),
  update: (input: UpdateProfileInput) =>
    apiClient.put<UserDto>('/me/profile', input, { schema: UserSchema }),
  /**
   * Change your own password. The API requires the current one, and on success it revokes
   * every session (including this one's refresh chain) — so the caller must send the user
   * back through login. Returns 204, hence no schema.
   */
  changePassword: (input: ChangePasswordInput) => apiClient.put<void>('/me/password', input),
}
