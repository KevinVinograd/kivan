/**
 * Auth business logic: credential verification + rotating refresh tokens with
 * reuse detection. JWT signing happens in the route (it needs `app.jwt`); this
 * service owns everything else.
 */
import { env } from '@hold/config';
import { runInTx } from '@hold/db';
import { effectiveCapabilities, type Capability, type Role } from '@hold/shared';
import { UnauthorizedError } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { newRawToken, hashToken } from '../../lib/tokens.js';
import { sendPasswordResetEmail } from '../../lib/mailer.js';
import { teamService } from '../team/team.service.js';
import type { InvitedProfileInput } from '../team/team.schema.js';
import type { InvitationPreviewDto } from './auth.schema.js';
import { authRepo } from './auth.repo.js';

// Precomputed once so a login for a non-existent user still does the same hash
// work — removes the timing oracle that would leak which emails exist.
const dummyHashPromise = hashPassword('timing-equalization-placeholder');

function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TTL_DAYS * 86_400_000);
}

type AuthUser = NonNullable<Awaited<ReturnType<typeof authRepo.findUserById>>>;

export const authService = {
  /**
   * The session's authorization, resolved once from the assigned custom role's grants:
   *  - `permissions`: the custom role's grant keys, or NULL when there is no custom role (or a
   *    system role). Null is the signal "governed by the built-in role" — `requirePermission`
   *    passes it through, so every existing session is unchanged. A non-null set only NARROWS.
   *  - `capabilities`: the four money/PII switches derived from the same grants (built-in when
   *    null). Kept as its own field because the money gates read it directly.
   * Minted into the token; a role/grant change applies on the next refresh.
   */
  async sessionAuthz(
    user: { role: string; roleId: string | null },
  ): Promise<{ capabilities: Capability[]; permissions: string[] | null }> {
    const grants = user.roleId ? await authRepo.findRoleGrants(user.roleId) : null;
    return {
      capabilities: effectiveCapabilities(user.role as Role, grants),
      permissions: grants,
    };
  },

  /**
   * Verify email + password; throws a uniform 401 on any failure.
   */
  async verifyCredentials(email: string, password: string): Promise<AuthUser> {
    const user = await authRepo.findUserByEmail(email);
    if (!user || user.status !== 'active') {
      await verifyPassword(await dummyHashPromise, password);
      throw new UnauthorizedError('Invalid credentials');
    }
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      throw new UnauthorizedError('Invalid credentials');
    }
    return user;
  },

  /** Mint and persist a new (hashed) refresh token; returns the raw token. */
  async issueRefreshToken(userId: string): Promise<string> {
    const raw = newRawToken();
    await authRepo.createRefreshToken({ userId, tokenHash: hashToken(raw), expiresAt: refreshExpiry() });
    return raw;
  },

  /**
   * Rotate a refresh token. Presenting an already-revoked token = reuse → the
   * whole chain is revoked (theft detection). Returns the user + the new token.
   */
  async rotateRefreshToken(raw: string): Promise<{ user: AuthUser; refreshToken: string }> {
    const token = await authRepo.findRefreshToken(hashToken(raw));
    if (!token) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    if (token.revokedAt) {
      await authRepo.revokeAllForUser(token.userId);
      throw new UnauthorizedError('Refresh token reuse detected');
    }
    if (token.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('Refresh token expired');
    }
    // Re-check the account against the DB on every renewal. A user disabled
    // (status != 'active') AFTER login must not keep rotating: kill the whole
    // chain so their session ends within one access-token lifetime. Also, the new
    // access token is re-minted from this user's CURRENT role (claims(user) in the
    // route), so a role change takes effect on the next refresh.
    const user = await authRepo.findUserById(token.userId);
    if (!user) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    if (user.status !== 'active') {
      await authRepo.revokeAllForUser(token.userId);
      throw new UnauthorizedError('Account is not active');
    }
    const nextRaw = newRawToken();
    const rotated = await authRepo.rotate(token.id, {
      userId: token.userId,
      tokenHash: hashToken(nextRaw),
      expiresAt: refreshExpiry(),
    });
    if (!rotated) {
      // Lost the rotation race — the token was already consumed. Treat as a
      // reuse/theft signal and revoke the whole chain.
      await authRepo.revokeAllForUser(token.userId);
      throw new UnauthorizedError('Refresh token reuse detected');
    }
    return { user, refreshToken: nextRaw };
  },

  async me(userId: string): Promise<AuthUser> {
    const user = await authRepo.findUserById(userId);
    if (!user) {
      throw new UnauthorizedError();
    }
    return user;
  },

  /**
   * Consume an invitation token to set the member's password and activate them.
   * A missing / already-used / expired token throws the SAME uniform 401 so the
   * endpoint is not an oracle for which tokens exist. Single-use is enforced
   * atomically in the repo (guarded claim) — a replayed token is rejected.
   */
  /**
   * What the set-password screen may know before anyone has authenticated: a first name to
   * greet with, and whether to ask this person to complete their ficha.
   *
   * `needsProfile` is FALSE for a password reset. The same route serves both flows, and a
   * person recovering their password must not be marched back through an onboarding form —
   * a first-time invite is a `pending` user, a reset is an already-active one.
   */
  async invitationPreview(rawToken: string): Promise<InvitationPreviewDto> {
    const invitation = await authRepo.findInvitationByHash(hashToken(rawToken));
    if (!invitation || invitation.usedAt || invitation.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('Invalid or expired invitation');
    }
    const user = await authRepo.findUserById(invitation.userId);
    if (!user) {
      throw new UnauthorizedError('Invalid or expired invitation');
    }
    return {
      firstName: user.firstName,
      needsProfile: user.status === 'pending' && user.teamMemberId != null,
    };
  },

  /**
   * Consume an invitation: set the password, activate the login, and — for a first-time
   * invite of someone with a roster ficha — write the profile they just filled in.
   *
   * One transaction, so the password and the ficha commit together or not at all.
   *
   * The security property that matters: **the ficha written is the one the TOKEN resolves
   * to**. `teamMemberId` is read from the user row, never from the
   * request — a caller holding a valid token cannot aim this at somebody else's ficha by
   * sending an id. And a reset (already-active user) never writes a profile at all, so a
   * stolen reset link cannot be used to rewrite the victim's bank details.
   */
  async acceptInvitation(
    rawToken: string,
    password: string,
    profile?: InvitedProfileInput,
  ): Promise<void> {
    const invitation = await authRepo.findInvitationByHash(hashToken(rawToken));
    if (!invitation || invitation.usedAt || invitation.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('Invalid or expired invitation');
    }
    const user = await authRepo.findUserById(invitation.userId);
    if (!user) {
      throw new UnauthorizedError('Invalid or expired invitation');
    }
    // Read BEFORE the write: consuming flips `pending` → `active`, so asking afterwards
    // would call every invite a reset.
    const isFirstTimeInvite = user.status === 'pending';
    const passwordHash = await hashPassword(password);
    const consumed = await runInTx(async (tx) => {
      const claimed = await authRepo.consumeInvitation(tx, invitation.id, user.id, passwordHash);
      if (!claimed) return false;
      if (profile && isFirstTimeInvite && user.teamMemberId) {
        await teamService.completeOwnProfile(tx, user.teamMemberId, profile);
      }
      return true;
    });
    if (!consumed) {
      throw new UnauthorizedError('Invalid or expired invitation');
    }
  },

  /**
   * Log out: revoke the presented refresh token so it can never be rotated again. The
   * client also clears it locally, but without this the token stays valid server-side for
   * its full TTL — a stolen or cached refresh token would outlive the sign-out. Idempotent
   * and never throws (an unknown/already-revoked token is a no-op), so logout always
   * succeeds from the caller's side.
   */
  async logout(rawRefreshToken: string): Promise<void> {
    await authRepo.revokeByHash(hashToken(rawRefreshToken));
  },

  /**
   * Self-service "forgot password": email the account a one-time set-password link, reusing
   * the invite machinery. **Enumeration-safe** — it ALWAYS resolves the same way whether or
   * not the email exists, so the endpoint never reveals which addresses have accounts. A
   * hit for an ACTIVE user mints a token and mails the reset link; anything else (unknown
   * email, disabled account) is a silent no-op. Disabled users are excluded on purpose:
   * consuming the link would reactivate them.
   */
  async forgotPassword(rawEmail: string): Promise<void> {
    const user = await authRepo.findUserByEmail(rawEmail);
    if (!user || user.status !== 'active') return;
    const rawToken = newRawToken();
    const expiresAt = new Date(Date.now() + env.INVITE_TTL_HOURS * 3_600_000);
    await authRepo.createInvitation({ userId: user.id, tokenHash: hashToken(rawToken), expiresAt });
    // Nobody is signed in here, so the account the link is for is the only identity
    // there is to attribute a failed send to.
    await sendPasswordResetEmail(
      {
        to: user.email,
        firstName: user.firstName,
        url: `${env.APP_URL}/aceptar-invitacion?token=${rawToken}`,
        ttlHours: env.INVITE_TTL_HOURS,
      },
      user.id,
    );
  },
};
