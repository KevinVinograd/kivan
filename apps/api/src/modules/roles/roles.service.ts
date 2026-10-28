/**
 * Roles service — create, edit and delete studio-defined roles.
 *
 * WHAT THIS DOES: it writes the role DEFINITIONS. Enforcement lives elsewhere and
 * IS live — once a role is assigned to a member, its grant keys ride that member's
 * JWT (`permissions`) and the API gates the catalogue with `requirePermission`
 * (alongside `requireRole`), narrowing — never escalating — the built-in role.
 * Per-permission enforceability still varies and the editor states it per key
 * (`enforced` / `Solo lo oculta` / `Todavía sin efecto`), so a save never implies a
 * boundary a given permission does not hold.
 *
 * The invariants below exist so a studio cannot damage its own access:
 *   - System roles are read-only. They are the floor the product guarantees.
 *   - A role someone still holds cannot be deleted; move its holders first.
 *   - Names are unique per workspace, so a role is identifiable by what it is
 *     called (which is how it is chosen when assigning it).
 *   - Every write is version-guarded and audited.
 */
import type { Prisma } from '@hold/db';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { appendAudit } from '../../lib/audit.js';
import { rolesRepo } from './roles.repo.js';
import { toRoleDto, type CreateRoleInput, type RoleDto, type UpdateRoleInput } from './roles.schema.js';

/** A system role is the product's own floor: readable, never editable. */
function refuseIfSystem(role: { isSystem: boolean }): void {
  if (role.isSystem) {
    throw new ConflictError('Los roles que vienen con el producto no se editan ni se eliminan');
  }
}

/**
 * The three roles that ship with the product. `grants` stays EMPTY on purpose:
 * their authority is the `Role` enum plus `ROLE_CAPABILITIES` in @hold/shared,
 * which is what the API actually checks. Materializing a copy here would create
 * a second source of truth that drifts the first time the capability table is
 * retuned.
 *
 * The 0010 migration seeds these for workspaces that existed when it ran; this
 * list is the live copy, for every workspace created afterwards.
 */
const SYSTEM_ROLES = [
  {
    key: 'owner',
    name: 'Dueño',
    description: 'Ve y hace todo, y es el único que gobierna a los demás administradores.',
  },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Corre la operación y el cierre, con la misma visibilidad de la plata que el Dueño.',
  },
  {
    key: 'employee',
    name: 'Equipo',
    description: 'Hace el trabajo del cliente y registra lo suyo. Nunca ve la plata del estudio.',
  },
] as const;

export const rolesService = {
  /**
   * Reconcile the system roles, idempotently.
   *
   * A fresh database has no system rows, and the product must not depend on
   * someone remembering to run a backfill — a studio with no roles cannot assign
   * anyone. Called on read so it heals on first use. `createMany({ skipDuplicates })`
   * makes a re-run a no-op against the `key` unique index.
   */
  async ensureSystemRoles(tx: Prisma.TransactionClient): Promise<void> {
    await rolesRepo.ensureSystemRoles(tx, SYSTEM_ROLES);
  },

  async list(tx: Prisma.TransactionClient): Promise<RoleDto[]> {
    await this.ensureSystemRoles(tx);
    const rows = await rolesRepo.list(tx);
    return rows.map((row) => toRoleDto(row, row._count.users));
  },

  async create(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    input: CreateRoleInput,
  ): Promise<RoleDto> {
    const clash = await rolesRepo.findByName(tx, input.name);
    if (clash) throw new ConflictError('Ya existe un rol con ese nombre');

    const row = await rolesRepo.create(tx, input);
    await appendAudit(tx, actorUserId, {
      entityType: 'WorkspaceRole',
      entityId: row.id,
      action: 'role.create',
      after: { name: row.name, grants: row.grants },
    });
    return toRoleDto(row, row._count.users);
  },

  async update(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    id: string,
    input: UpdateRoleInput,
  ): Promise<RoleDto> {
    const existing = await rolesRepo.findById(tx, id);
    if (!existing) throw new NotFoundError('Rol no encontrado');
    refuseIfSystem(existing);

    if (input.name && input.name !== existing.name) {
      const clash = await rolesRepo.findByName(tx, input.name);
      if (clash) throw new ConflictError('Ya existe un rol con ese nombre');
    }

    const { version, ...data } = input;
    const changed = await rolesRepo.update(tx, id, version, data);
    if (changed === 0) {
      // The row exists (checked above) and is not a system role, so the only way
      // to match nothing is a version mismatch: somebody else saved first.
      throw new ConflictError('Alguien más editó este rol. Recargá y volvé a intentar');
    }

    const updated = await rolesRepo.findById(tx, id);
    if (!updated) throw new NotFoundError('Rol no encontrado');

    await appendAudit(tx, actorUserId, {
      entityType: 'WorkspaceRole',
      entityId: id,
      action: 'role.update',
      before: { name: existing.name, grants: existing.grants },
      after: { name: updated.name, grants: updated.grants },
    });
    return toRoleDto(updated, updated._count.users);
  },

  async remove(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    id: string,
    version: number,
  ): Promise<void> {
    const existing = await rolesRepo.findById(tx, id);
    if (!existing) throw new NotFoundError('Rol no encontrado');
    refuseIfSystem(existing);

    // Refuse before the FK does. Deleting a role out from under its holders
    // would either drop their access or widen it through a fallback, so the
    // holders move first. The ON DELETE RESTRICT constraint is the backstop.
    if (existing._count.users > 0) {
      throw new ConflictError(
        `No se puede eliminar: ${existing._count.users} ${existing._count.users === 1 ? 'persona tiene' : 'personas tienen'} este rol. Movelas a otro rol primero`,
      );
    }

    const removed = await rolesRepo.remove(tx, id, version);
    if (removed === 0) {
      throw new ConflictError('Alguien más editó este rol. Recargá y volvé a intentar');
    }

    await appendAudit(tx, actorUserId, {
      entityType: 'WorkspaceRole',
      entityId: id,
      action: 'role.delete',
      before: { name: existing.name, grants: existing.grants },
    });
  },

  /**
   * Give a user a role.
   *
   * Owner-only at the route, which collapses most of the governance hierarchy in
   * `settings.service.ts`: there is exactly one actor who can reach this, and
   * they govern everyone. Two guards survive because they protect against the
   * owner harming themselves or the workspace:
   *   - Nobody changes their OWN role. The owner demoting themselves is the
   *     fastest way to lock a studio out of its own settings.
   *   - The owner seat is not reassignable here. Moving it is an ownership
   *     transfer, a different operation with different consequences, and it does
   *     not exist yet.
   */
  async assign(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    targetUserId: string,
    roleId: string,
  ): Promise<void> {
    // ⚠️ UNREACHABLE TODAY, AND KNOWINGLY UNTESTED. The route is owner-only, so
    // the only actor who gets here is the owner, and "the actor" and "the owner
    // seat" are the same person — the `target.role === 'owner'` check below
    // catches every case this one would. Verified: disabling this guard leaves
    // the whole suite green, which is why the test below does NOT claim to cover
    // it. Kept as defence in depth for when `role.manage` can be delegated to a
    // custom role; at that point a non-owner actor exists, this becomes
    // reachable, and it needs a test of its own.
    if (targetUserId === actorUserId) {
      throw new ConflictError('No podés cambiarte el rol a vos mismo');
    }

    const target = await rolesRepo.findUser(tx, targetUserId);
    if (!target) throw new NotFoundError('Persona no encontrada');
    if (target.role === 'owner') {
      throw new ConflictError('El Dueño no cambia de rol desde acá. Requiere una transferencia de propiedad');
    }

    const role = await rolesRepo.findById(tx, roleId);
    if (!role) throw new NotFoundError('Rol no encontrado');
    if (role.isOwner) {
      throw new ConflictError('El rol de Dueño no se asigna desde acá. Requiere una transferencia de propiedad');
    }

    await rolesRepo.assignRole(tx, targetUserId, roleId, role.isSystem ? role.key : null);

    await appendAudit(tx, actorUserId, {
      entityType: 'User',
      entityId: targetUserId,
      action: 'user.role.assign',
      before: { roleId: target.roleId, role: target.role },
      // `role` is unchanged for a custom target — recorded so the audit trail
      // shows the effective enum did not move.
      after: { roleId, role: role.isSystem ? role.key : target.role },
    });
  },
};
