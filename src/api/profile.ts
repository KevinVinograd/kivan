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
  changePassword: (input: ChangePasswordInput) => apiClient.put<void>('/me/password', input),
}
