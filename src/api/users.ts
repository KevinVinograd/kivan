import { z } from 'zod'

import { apiClient } from './client'

export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(),
  status: z.string(),
  teamMemberId: z.string().nullable(),
  workspaceRoleId: z.string().nullable(),
})
export type UserDto = z.infer<typeof UserSchema>

export const UsersSchema = z.array(UserSchema)

export type AssignableUserRole = 'admin' | 'employee'

export interface CreateUserInput {
  email: string
  firstName: string
  lastName: string
  role: AssignableUserRole
  teamMemberId?: string
}

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
  changeStatus: (id: string, status: 'active' | 'disabled') =>
    apiClient.patch<UserDto>(`/users/${id}/status`, { status }, { schema: UserSchema }),
  sendPasswordReset: (id: string) =>
    apiClient.post<ResetResult>(`/users/${id}/password-reset`, undefined, { schema: ResetResultSchema }),
  transferOwnership: (id: string) =>
    apiClient.post<UserDto>(`/users/${id}/transfer-ownership`, undefined, { schema: UserSchema }),
}

export const ResetResultSchema = z.object({ link: z.string().optional(), mailed: z.boolean() })
export type ResetResult = z.infer<typeof ResetResultSchema>
