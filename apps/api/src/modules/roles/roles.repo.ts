/**
 * Roles repository.
 */
import type { Prisma } from '@hold/db';

export const rolesRepo = {
  /** Every role, with how many users hold each one. */
  async list(tx: Prisma.TransactionClient) {
    return tx.workspaceRole.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { users: true } } },
    });
  },

  async findById(tx: Prisma.TransactionClient, id: string) {
    return tx.workspaceRole.findFirst({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
  },

  async findByName(tx: Prisma.TransactionClient, name: string) {
    return tx.workspaceRole.findFirst({ where: { name } });
  },

  async create(
    tx: Prisma.TransactionClient,
    data: { name: string; description?: string | null; grants: string[] },
  ) {
    return tx.workspaceRole.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        grants: data.grants,
        isSystem: false,
        isOwner: false,
      },
      include: { _count: { select: { users: true } } },
    });
  },

  /**
   * Version-guarded update: the WHERE carries the expected version, so a stale
   * writer matches no row and gets 0 back rather than silently clobbering a
   * concurrent edit. `updateMany` is what makes the guard atomic.
   */
  async update(
    tx: Prisma.TransactionClient,
    id: string,
    version: number,
    data: { name?: string; description?: string | null; grants?: string[] },
  ): Promise<number> {
    const result = await tx.workspaceRole.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    return result.count;
  },

  /** Version-guarded delete, same reasoning as `update`. */
  async remove(
    tx: Prisma.TransactionClient,
    id: string,
    version: number,
  ): Promise<number> {
    const result = await tx.workspaceRole.deleteMany({ where: { id, version } });
    return result.count;
  },

  /** Resolve the seeded system row for a built-in role key. */
  async findSystemByKey(tx: Prisma.TransactionClient, key: string) {
    return tx.workspaceRole.findFirst({ where: { key, isSystem: true } });
  },

  /** Idempotent: `skipDuplicates` makes a re-run a no-op against the
   *  `key` unique index, so this is safe to call on every read. */
  async ensureSystemRoles(
    tx: Prisma.TransactionClient,
    roles: readonly { key: string; name: string; description: string }[],
  ): Promise<void> {
    await tx.workspaceRole.createMany({
      data: roles.map((role) => ({
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: true,
        isOwner: role.key === 'owner',
        grants: [],
      })),
      skipDuplicates: true,
    });
  },

  async findUser(tx: Prisma.TransactionClient, userId: string) {
    return tx.user.findFirst({
      where: { id: userId },
      select: { id: true, role: true, roleId: true, firstName: true, lastName: true },
    });
  },

  /**
   * Point a user at a role definition.
   *
   * `role` (the built-in enum) is written ONLY when the target is a system role,
   * where the mapping is exact. Assigning a CUSTOM role leaves the enum untouched
   * on purpose: the custom grants are enforced through the `permissions` claim,
   * which only NARROWS the built-in role — keeping the enum intact preserves the
   * fallback and guarantees enforcement can never escalate. The two columns are
   * written in one statement so they can never half-apply.
   */
  async assignRole(
    tx: Prisma.TransactionClient,
    userId: string,
    roleId: string,
    systemKey: string | null,
  ): Promise<void> {
    await tx.user.updateMany({
      where: { id: userId },
      data: {
        roleId,
        ...(systemKey ? { role: systemKey as 'owner' | 'admin' | 'employee' } : {}),
      },
    });
  },
};
