/**
 * Studio-defined roles — thin typed wrappers over the api client.
 *
 * A role saved through here is a DEFINITION that IS enforced once assigned: its
 * grant keys ride the assigned member's JWT (`permissions`) and the backend gates
 * the catalogue with `requirePermission` (alongside the built-in `requireRole`),
 * narrowing — never escalating — the built-in role. Per-permission enforceability
 * still varies and the editor says so per key (`enforced` / `Solo lo oculta` /
 * `Todavía sin efecto`).
 *
 * Owner-only server-side (`requireRole('owner')`) — every call here 403s for any
 * other role.
 */
import { z } from 'zod'
import { apiClient } from './client'

export const RoleSchema = z.object({
  id: z.string(),
  /** `owner` | `admin` | `employee` for the three built-in rows; null if studio-made. */
  key: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  isOwner: z.boolean(),
  /** Permission keys (`resource.action`). Empty for system roles, whose authority
   *  is the built-in capability table rather than a stored copy. */
  grants: z.array(z.string()),
  /** Optimistic concurrency — echo it back on update and delete. */
  version: z.number(),
  /** How many people hold this role. Non-zero makes deletion refusable. */
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

  // 204 No Content — nothing to validate, so no schema (RS001 covers wrappers
  // that return a body).
  remove: (id: string, version: number) =>
    apiClient.delete<void>(`/roles/${id}?version=${version}`),

  /** Give a person a role. Assigning a CUSTOM role deliberately leaves their
   *  built-in `User.role` untouched — the custom grants ride the `permissions`
   *  claim and only NARROW that role, enforced on the member's next session. */
  assign: (userId: string, roleId: string) =>
    apiClient.patch<void>(`/users/${userId}/workspace-role`, { roleId }),
}
