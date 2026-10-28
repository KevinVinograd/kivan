/**
 * Settings service — workspace config, user management, and profile. Mutations
 * append an AuditEvent.
 *
 * Account governance is a hierarchy, enforced here rather than in the route gate
 * because it depends on the ACTOR and the TARGET together, not on the caller's
 * role alone:
 *   - The owner is untouchable — nobody demotes or deactivates them (an
 *     ownership transfer is the only way out of that seat).
 *   - An admin may be demoted or deactivated only BY THE OWNER. Admins are peers;
 *     letting them remove each other means whoever clicks first wins.
 *   - An admin may still manage employees, which is the point of the role.
 *   - Nobody may change their own role or status.
 */
import type { Prisma } from '@hold/db';
import type { Role } from '@hold/shared';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../lib/errors.js';
import { randomBytes } from 'node:crypto';
import { env } from '@hold/config';
import { appendAudit } from '../../lib/audit.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { newRawToken, hashToken } from '../../lib/tokens.js';
import { sendInvitationEmail, sendPasswordResetEmail } from '../../lib/mailer.js';
import { rolesRepo } from '../roles/roles.repo.js';
import { settingsRepo } from './settings.repo.js';
import {
  toUserDto,
  toWorkspaceDto,
  type ChangePasswordInput,
  type InviteUserInput,
  type UpdateProfileInput,
  type UpdateWorkspaceInput,
  type UserDto,
  type WorkspaceDto,
} from './settings.schema.js';

/** Result of inviting a member: the created user + the set-password link and
 * whether the invitation email actually went out (false → hand the link over). */
export interface InviteResult {
  user: UserDto;
  invite: { link: string; mailed: boolean };
}

/**
 * End every active session of a user by revoking their refresh-token chains. Access
 * tokens already issued stay valid until they expire (minutes), but the session cannot
 * be extended — this is what makes a deactivation or a password change actually bite.
 */
async function revokeSessions(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export const settingsService = {
  async getWorkspace(tx: Prisma.TransactionClient): Promise<WorkspaceDto> {
    return toWorkspaceDto(await settingsRepo.getOrCreateWorkspace(tx));
  },

  async updateWorkspace(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    input: UpdateWorkspaceInput,
  ): Promise<WorkspaceDto> {
    const current = await settingsRepo.getOrCreateWorkspace(tx);
    const updated = await settingsRepo.updateWorkspace(tx, current.id, input);
    await appendAudit(tx, actorUserId, {
      entityType: 'workspace',
      entityId: current.id,
      action: 'workspace.update',
      after: input,
    });
    return toWorkspaceDto(updated);
  },

  async listUsers(tx: Prisma.TransactionClient): Promise<UserDto[]> {
    return (await settingsRepo.listUsers(tx)).map(toUserDto);
  },

  async inviteUser(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    input: InviteUserInput,
  ): Promise<InviteResult> {
    // Optional roster link: validate BEFORE creating the user so a bad or taken id fails
    // with a clean 400/409 instead of a raw FK/unique violation. The member must exist
    // and not already be linked to another login.
    if (input.teamMemberId) {
      const member = await settingsRepo.findTeamMember(tx, input.teamMemberId);
      if (!member) {
        throw new BadRequestError('teamMemberId does not reference a member in this workspace');
      }
      const taken = await settingsRepo.findUserByTeamMemberId(tx, input.teamMemberId);
      if (taken) {
        throw new ConflictError('That team member is already linked to another login');
      }
    }

    // No password is set yet: the member gets an unusable random hash + status
    // 'pending' and sets their own via the invitation link. passwordHash is NOT
    // NULL, so it can't be left empty — the random value just guarantees no local
    // login works until they set a real one.
    const passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
    const created = await settingsRepo.createUser(tx, {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      status: 'pending',
      ...(input.teamMemberId ? { teamMemberId: input.teamMemberId } : {}),
    });

    // Mint a one-time invitation token (only its hash is stored) → set-password link.
    const rawToken = newRawToken();
    const expiresAt = new Date(Date.now() + env.INVITE_TTL_HOURS * 3_600_000);
    await settingsRepo.createInvitation(tx, {
      userId: created.id,
      tokenHash: hashToken(rawToken),
      expiresAt,
    });
    const link = `${env.APP_URL}/aceptar-invitacion?token=${rawToken}`;

    // Email the link; if mail is off or fails, return it so the admin passes it
    // along by hand. The member EXISTS regardless.
    const { mailed } = await sendInvitationEmail(
      {
        to: input.email,
        firstName: input.firstName,
        url: link,
        ttlHours: env.INVITE_TTL_HOURS,
      },
      actorUserId,
    );

    await appendAudit(tx, actorUserId, {
      entityType: 'user',
      entityId: created.id,
      action: 'user.invite',
      after: { email: input.email, role: input.role },
    });
    return { user: toUserDto(created), invite: { link, mailed } };
  },

  async changeUserRole(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    actorRole: Role,
    id: string,
    role: 'admin' | 'employee',
  ): Promise<UserDto> {
    const target = await settingsRepo.findUser(tx, id);
    if (!target) {
      throw new NotFoundError(`User ${id} not found`);
    }
    if (id === actorUserId) {
      throw new BadRequestError('You cannot change your own role');
    }
    if (target.role === 'owner') {
      throw new ConflictError('Owners cannot be demoted here — use an ownership transfer');
    }
    if (target.role === 'admin' && actorRole !== 'owner') {
      throw new ForbiddenError('Only the owner can change an admin’s role');
    }
    const updated = await settingsRepo.updateUserRole(tx, id, role);
    await appendAudit(tx, actorUserId, {
      entityType: 'user',
      entityId: id,
      action: 'user.role',
      before: { role: target.role },
      after: { role },
    });
    return toUserDto(updated);
  },

  /**
   * Deactivate or reactivate a member. Disabling ends their sessions immediately —
   * `verifyCredentials`/refresh already refuse a non-active user, so this is what
   * actually locks someone out. Same invariants as a role change: not yourself (you
   * would lock the workspace's only manager out of its own settings), never the
   * owner (that needs an ownership transfer first), and an admin only by the owner.
   */
  async changeUserStatus(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    actorRole: Role,
    id: string,
    status: 'active' | 'disabled',
  ): Promise<UserDto> {
    const target = await settingsRepo.findUser(tx, id);
    if (!target) {
      throw new NotFoundError(`User ${id} not found`);
    }
    if (id === actorUserId) {
      throw new BadRequestError('You cannot change your own status');
    }
    if (target.role === 'owner') {
      throw new ConflictError('The owner cannot be deactivated — transfer ownership first');
    }
    if (target.role === 'admin' && actorRole !== 'owner') {
      throw new ForbiddenError('Only the owner can deactivate an admin');
    }
    const updated = await settingsRepo.updateProfile(tx, id, { status });
    if (status === 'disabled') {
      await revokeSessions(tx, id);
    }
    await appendAudit(tx, actorUserId, {
      entityType: 'user',
      entityId: id,
      action: 'user.status',
      before: { status: target.status },
      after: { status },
    });
    return toUserDto(updated);
  },

  /**
   * Hand the owner seat to another member. The single write that changes who the
   * owner is: the target becomes `owner` and the current owner steps down to
   * `admin`, atomically in one transaction so the workspace can never end up with
   * two owners or none. Owner-only (the route gates it), and re-checked here: the
   * actor must actually hold the owner seat, and the target must be an active
   * member of this workspace who is not the actor.
   *
   * Both the built-in `role` enum (what the API authorizes on) AND `roleId` (the
   * system role row) are moved together, matching the assign path, so the two never
   * disagree. `role` alone would leave the demoted owner's roleId pointing at the
   * owner system row.
   */
  async transferOwnership(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    targetUserId: string,
  ): Promise<UserDto> {
    if (targetUserId === actorUserId) {
      throw new BadRequestError('You already own this workspace');
    }
    const actor = await settingsRepo.findUser(tx, actorUserId);
    if (!actor || actor.role !== 'owner') {
      throw new ForbiddenError('Only the owner can transfer ownership');
    }
    const target = await settingsRepo.findUser(tx, targetUserId);
    if (!target) {
      throw new NotFoundError(`User ${targetUserId} not found`);
    }
    if (target.status !== 'active') {
      throw new ConflictError('Ownership can only be transferred to an active member');
    }
    // Resolve the system role rows so enum + roleId stay aligned. They are seeded on
    // first roles read; if a legacy workspace lacks them, fall back to enum-only
    // (roleId stays as-is), matching the existing changeUserRole convention.
    const ownerRole = await rolesRepo.findSystemByKey(tx, 'owner');
    const adminRole = await rolesRepo.findSystemByKey(tx, 'admin');
    const newOwner = await settingsRepo.updateProfile(tx, targetUserId, {
      role: 'owner',
      ...(ownerRole ? { roleId: ownerRole.id } : {}),
    });
    await settingsRepo.updateProfile(tx, actorUserId, {
      role: 'admin',
      ...(adminRole ? { roleId: adminRole.id } : {}),
    });
    await appendAudit(tx, actorUserId, {
      entityType: 'user',
      entityId: targetUserId,
      action: 'user.ownership.transfer',
      before: { ownerUserId: actorUserId },
      after: { ownerUserId: targetUserId },
    });
    // The update's own return value IS the new owner's post-write row, so the re-read was a
    // second query for data already in hand — and its `?? updatedActor` fallback would have
    // answered with the WRONG person (the just-demoted ex-owner) the day it fired.
    return toUserDto(newOwner);
  },

  /**
   * Send a password-reset link to ANOTHER member (owner/admin) — the recovery path for
   * someone locked out. It mints a one-time set-password token (the same `Invitation`
   * machinery the member-invite uses) and emails the member a link; they choose their own
   * new password via `/aceptar-invitacion`, which revokes their old sessions on consume.
   *
   * **The link IS the credential.** Whoever holds it sets that member's password, so the
   * only thing standing between an admin and the owner's account is whether the token
   * reaches the actor. It is therefore returned in exactly one case: the mail did not go
   * out, so the actor has to hand it over in person — and the guard below has already
   * established that this can only happen downward. When the mail went out, the response
   * carries no link at all, for any target.
   *
   * This used to return `{ link, mailed }` unconditionally on the reading that "the actor
   * never sees the password". They do not. They see the token, which is better: the
   * `/auth/accept-invitation` route is public and takes `{ token, password }`, so an admin
   * could reset the OWNER, read the token out of their own 200 body with curl, and take the
   * account over. The UI hiding the link when `mailed` is true never mattered — nothing
   * obliges an attacker to use the UI.
   *
   * Two other guards: not yourself (you are logged in — use `changePassword`), and not a
   * DISABLED member (consuming the link would silently reactivate them; reactivate first).
   */
  async sendPasswordReset(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    actorRole: Role,
    id: string,
  ): Promise<{ link?: string; mailed: boolean }> {
    const target = await settingsRepo.findUser(tx, id);
    if (!target) {
      throw new NotFoundError(`User ${id} not found`);
    }
    if (id === actorUserId) {
      throw new BadRequestError('Use change password to set your own — it needs your current one');
    }
    if (target.status === 'disabled') {
      throw new ConflictError('Reactivate the member before resetting their password');
    }

    // The same hierarchy the other two governance mutations enforce: the owner is above
    // everyone, and admins are peers rather than each other's managers. Here it does not
    // forbid the action — an admin SHOULD be able to help a locked-out owner — it decides
    // whether the token may ever come back in the response.
    const targetOutranksActor =
      target.role === 'owner' || (target.role === 'admin' && actorRole !== 'owner');
    // Mail off means the hand-over-on-screen fallback is the only delivery there is, and
    // for an outranking target that fallback IS the takeover. Refuse before minting rather
    // than mint a token nobody may receive.
    if (targetOutranksActor && !env.MAIL_ENABLED) {
      throw new ForbiddenError(
        'Resetting this member’s password needs mail delivery enabled, so the link reaches them and not you',
      );
    }

    const rawToken = newRawToken();
    const expiresAt = new Date(Date.now() + env.INVITE_TTL_HOURS * 3_600_000);
    await settingsRepo.createInvitation(tx, { userId: id, tokenHash: hashToken(rawToken), expiresAt });
    const link = `${env.APP_URL}/aceptar-invitacion?token=${rawToken}`;
    const { mailed } = await sendPasswordResetEmail(
      {
        to: target.email,
        firstName: target.firstName,
        url: link,
        ttlHours: env.INVITE_TTL_HOURS,
      },
      actorUserId,
    );
    // Mail was on but the send failed, so the link would fall back to the actor's
    // screen — the same takeover the check above prevents, arrived at by a different
    // route. Throwing rolls the transaction back, so no orphan token survives.
    if (!mailed && targetOutranksActor) {
      throw new ConflictError(
        'The reset link could not be emailed, and it cannot be handed over on screen for this member',
      );
    }
    await appendAudit(tx, actorUserId, {
      entityType: 'user',
      entityId: id,
      action: 'user.password_reset',
    });
    // Withheld whenever the mail went out: the caller does not need it (the UI reads `link`
    // only on the `mailed:false` branch) and a token in a response body is a token in a log,
    // a proxy cache and a devtools pane. The guard above guarantees that reaching here with
    // `mailed:false` means the target does NOT outrank the actor.
    return { link: mailed ? undefined : link, mailed };
  },

  /**
   * Change your OWN password. The current password is required (an access token alone
   * must not be enough to take the account over), and every session is revoked after
   * the change so a leaked refresh token dies with the old password.
   */
  async changePassword(
    tx: Prisma.TransactionClient,
    userId: string,
    input: ChangePasswordInput,
  ): Promise<void> {
    const user = await settingsRepo.findUserById(tx, userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    const matches = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!matches) {
      throw new UnauthorizedError('Current password is incorrect');
    }
    const passwordHash = await hashPassword(input.newPassword);
    await settingsRepo.updateProfile(tx, userId, { passwordHash });
    await revokeSessions(tx, userId);
    await appendAudit(tx, userId, {
      entityType: 'user',
      entityId: userId,
      action: 'user.password',
    });
  },

  async getProfile(tx: Prisma.TransactionClient, userId: string): Promise<UserDto> {
    const user = await settingsRepo.findUserById(tx, userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return toUserDto(user);
  },

  async updateProfile(
    tx: Prisma.TransactionClient,
    userId: string,
    input: UpdateProfileInput,
  ): Promise<UserDto> {
    const before = await settingsRepo.findUserById(tx, userId);
    const updated = await settingsRepo.updateProfile(tx, userId, input);
    // Every other settings mutation records an audit event; this one used to be the lone
    // exception. Record the name change so the log is complete.
    await appendAudit(tx, userId, {
      entityType: 'user',
      entityId: userId,
      action: 'user.profile',
      before: before ? { firstName: before.firstName, lastName: before.lastName } : undefined,
      after: { firstName: updated.firstName, lastName: updated.lastName },
    });
    return toUserDto(updated);
  },

  async recentAudit(tx: Prisma.TransactionClient, limit: number) {
    const rows = await settingsRepo.recentAudit(tx, limit);
    return rows.map((r) => ({
      id: r.id,
      actorUserId: r.actorUserId,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      createdAt: r.createdAt.toISOString(),
    }));
  },
};
