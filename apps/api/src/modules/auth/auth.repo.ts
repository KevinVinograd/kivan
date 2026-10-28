/**
 * Auth persistence: users, refresh tokens and invitations, read before a
 * session exists.
 */
import type { Prisma } from '@hold/db';
import { prisma } from '@hold/db';

interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export const authRepo = {
  findUserByEmail(email: string) {
    // Matched case-insensitively: new accounts are stored normalized, but any created
    // before that keep whatever casing was typed, and Postgres compares text exactly.
    // Lowercasing the INPUT instead would stop finding those rows and lock those people
    // out with the correct password.
    return prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
    });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  /** A CUSTOM role's grants, or null when the role is a system role (built-in authority, no
   *  stored grants) or doesn't resolve. Null means "no narrowing" → built-in capabilities.
   *  The roleId always belongs to its user. */
  async findRoleGrants(roleId: string): Promise<string[] | null> {
    const role = await prisma.workspaceRole.findUnique({
      where: { id: roleId },
      select: { grants: true, isSystem: true },
    });
    if (!role || role.isSystem) return null;
    return role.grants;
  },

  createRefreshToken(data: NewRefreshToken) {
    return prisma.refreshToken.create({ data });
  },

  findRefreshToken(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  },

  revokeAllForUser(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  /** Revoke a single refresh token by its hash (logout). Idempotent: an unknown or
   *  already-revoked token matches nothing and is a no-op. */
  revokeByHash(tokenHash: string) {
    return prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  /**
   * Atomically rotate: revoke the old token ONLY if it's still active (guarded
   * conditional update), then mint the replacement. Returns the new token, or
   * null if the old token was already revoked by a concurrent rotation (race) —
   * the caller treats that as a reuse signal. No TOCTOU: two racers contend on
   * the same row, exactly one wins the guarded revoke.
   */
  rotate(oldId: string, data: NewRefreshToken) {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: oldId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (claimed.count === 0) {
        return null;
      }
      const created = await tx.refreshToken.create({ data });
      await tx.refreshToken.update({ where: { id: oldId }, data: { replacedById: created.id } });
      return created;
    });
  },

  findInvitationByHash(tokenHash: string) {
    return prisma.invitation.findUnique({ where: { tokenHash } });
  },

  /** Mint a one-time set-password token (self-service forgot-password), same shape as the
   *  member-invite token so it is consumed through the same accept flow. */
  createInvitation(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    return prisma.invitation.create({ data });
  },

  /**
   * Consume an invitation to set the member's password and activate them —
   * atomic and single-use. The guarded `updateMany(... usedAt: null)` is the
   * TOCTOU-free claim: only the first caller flips usedAt and gets count===1;
   * a concurrent replay sees count===0 and is rejected (returns false). Any
   * pre-existing sessions are revoked defensively.
   */
  async consumeInvitation(
    tx: Prisma.TransactionClient,
    invitationId: string,
    userId: string,
    passwordHash: string,
  ): Promise<boolean> {
    const claimed = await tx.invitation.updateMany({
      where: { id: invitationId, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      return false;
    }
    await tx.user.update({ where: { id: userId }, data: { passwordHash, status: 'active' } });
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return true;
  },
};
