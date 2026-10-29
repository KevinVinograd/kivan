import { z } from 'zod'
import { apiClient } from './client'

export const RoleSchema = z.object({
  id: z.string(),
  key: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  isOwner: z.boolean(),
  grants: z.array(z.string()),
  version: z.number(),
  memberCount: z.number(),
})

export const RolesSchema = z.array(RoleSchema)

export type RoleDto = z.infer<typeof RoleSchema>

export interface CreateRoleInput {
  name: string
  description?: string
  grants: string[]
}

export interface UpdateRoleInput {
  name?: string
  description?: string | null
  grants?: string[]
  version: number
}

export const rolesApi = {
  list: () => apiClient.get<RoleDto[]>('/roles', { schema: RolesSchema }),

  create: (input: CreateRoleInput) =>
    apiClient.post<RoleDto>('/roles', input, { schema: RoleSchema }),

  update: (id: string, input: UpdateRoleInput) =>
    apiClient.put<RoleDto>(`/roles/${id}`, input, { schema: RoleSchema }),

  remove: (id: string, version: number) =>
    apiClient.delete<void>(`/roles/${id}?version=${version}`),

  assign: (userId: string, roleId: string) =>
    apiClient.patch<void>(`/users/${userId}/workspace-role`, { roleId }),
}
