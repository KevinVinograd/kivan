/**
 * Roles schema — a studio-defined role is a NAME plus the permission keys it
 * grants.
 *
 * Grants are stored as opaque `resource.action` strings rather than validated
 * against a server-side catalogue. That is deliberate: enforcement checks a
 * permission by MEMBERSHIP in the assigned member's `permissions` claim, so it
 * needs no catalogue to gate a route — the catalogue (the full key list + each
 * key's enforceability) still lives in the web app
 * (`src/app/pages/settings-roles-data.ts`) and would only move to `@hold/shared`
 * if the server ever validated keys against it. Validating against a list the
 * server does not own would reject keys the product legitimately adds, so the API
 * constrains the SHAPE (non-empty, bounded, unique) and leaves meaning to the
 * layer that owns it. Tighten this if/when the catalogue is shared server-side —
 * a permission that resolves to nothing must not be storable.
 */
import { z } from 'zod';

/** `resource.action`, optionally nested (`treasury.account.create`). */
const permissionKey = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'A permission key looks like resource.action');

export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).optional(),
  grants: z.array(permissionKey).max(500).default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(200).nullable().optional(),
  grants: z.array(permissionKey).max(500).optional(),
  /** Optimistic concurrency — a stale write loses instead of overwriting. */
  version: z.number().int().min(1),
});

export const roleIdParamSchema = z.object({ id: z.uuid() });

export const deleteRoleQuerySchema = z.object({ version: z.coerce.number().int().min(1) });

export const assignRoleSchema = z.object({ roleId: z.uuid() });

export const userIdParamSchema = z.object({ id: z.uuid() });

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export interface RoleDto {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  isOwner: boolean;
  grants: string[];
  version: number;
  /** How many users currently hold this role — what makes deletion refusable. */
  memberCount: number;
}

interface RoleRow {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  isOwner: boolean;
  grants: string[];
  version: number;
}

export function toRoleDto(row: RoleRow, memberCount: number): RoleDto {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    isSystem: row.isSystem,
    isOwner: row.isOwner,
    grants: row.grants,
    version: row.version,
    memberCount,
  };
}
