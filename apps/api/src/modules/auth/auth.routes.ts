/**
 * Auth routes.
 *   POST /auth/login    — PUBLIC. Verify credentials → access JWT + refresh.
 *   POST /auth/refresh  — PUBLIC. Rotate the refresh token → new pair.
 *   GET  /auth/me       — PROTECTED. The caller's resolved identity.
 *
 * The two public routes carry a tighter, dedicated per-IP rate limit
 * (RATE_LIMIT_AUTH) for brute-force / credential-stuffing protection.
 */
import type { FastifyInstance } from 'fastify';
import { env } from '@hold/config';
import { authService } from './auth.service.js';
import {
  acceptInvitationSchema,
  invitationPreviewSchema,
  type InvitationPreviewDto,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  type AuthTokensDto,
  type MeDto,
} from './auth.schema.js';
import { bindLogUser, type JwtPayload } from '../../plugins/auth.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const authLimit = {
    config: {
      rateLimit: { max: env.RATE_LIMIT_AUTH, timeWindow: env.RATE_LIMIT_AUTH_WINDOW },
    },
  };

  const claims = (
    user: {
      id: string;
      role: JwtPayload['role'];
      teamMemberId: string | null;
    },
    authz: { capabilities: JwtPayload['capabilities']; permissions: JwtPayload['permissions'] },
  ): JwtPayload => ({
    sub: user.id,
    role: user.role,
    teamMemberId: user.teamMemberId,
    capabilities: authz.capabilities,
    permissions: authz.permissions,
  });

  // The two routes below are PUBLIC, so nothing has bound the logger for them: they
  // learn who the caller is only once the credentials (or the refresh token) check out.
  // Binding it there is what makes a sign-in — and a failure AFTER the identity is
  // known — attributable, instead of one more `anon` line among the brute-force noise.
  app.post('/auth/login', authLimit, async (request, reply): Promise<AuthTokensDto> => {
    const { email, password } = loginSchema.parse(request.body);
    const user = await authService.verifyCredentials(email, password);
    bindLogUser(request, reply, user.id);
    const authz = await authService.sessionAuthz(user);
    const accessToken = app.jwt.sign(claims(user, authz));
    const refreshToken = await authService.issueRefreshToken(user.id);
    return { accessToken, tokenType: 'Bearer', refreshToken, expiresIn: env.ACCESS_TTL };
  });

  app.post('/auth/refresh', authLimit, async (request, reply): Promise<AuthTokensDto> => {
    const { refreshToken } = refreshSchema.parse(request.body);
    const { user, refreshToken: next } = await authService.rotateRefreshToken(refreshToken);
    bindLogUser(request, reply, user.id);
    const authz = await authService.sessionAuthz(user);
    const accessToken = app.jwt.sign(claims(user, authz));
    return { accessToken, tokenType: 'Bearer', refreshToken: next, expiresIn: env.ACCESS_TTL };
  });

  // PUBLIC. Log out: revoke the presented refresh token server-side so it can never be
  // rotated again (the client also clears it). Idempotent — an unknown/already-revoked
  // token still returns 204 — so a sign-out never fails.
  app.post('/auth/logout', authLimit, async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body);
    await authService.logout(refreshToken);
    return reply.status(204).send();
  });

  // PUBLIC. Self-service forgot-password: email a one-time reset link. ENUMERATION-SAFE —
  // always 204 whether or not the email exists, so it never reveals which addresses have
  // accounts. Rate-limited like the other public auth routes.
  app.post('/auth/forgot-password', authLimit, async (request, reply) => {
    const { email } = forgotPasswordSchema.parse(request.body);
    await authService.forgotPassword(email);
    return reply.status(204).send();
  });

  // PUBLIC. Consume an invitation token to set the password + activate. Rate-limited
  // like the other public auth routes. 204 on success → the web app sends the member
  // to /login to sign in with the password they just set.
  app.post('/auth/accept-invitation', authLimit, async (request, reply) => {
    const { token, password, profile } = acceptInvitationSchema.parse(request.body);
    await authService.acceptInvitation(token, password, profile);
    return reply.status(204).send();
  });

  // PUBLIC. What the set-password screen may know before anyone authenticates: a first name,
  // and whether to ask for the ficha. Rate-limited like its siblings, and it does NOT consume
  // the token — the screen reads it on mount and the person may take their time. It answers
  // 401 for an invalid/expired/used token, exactly as accept does, so it tells an attacker
  // nothing that route would not have.
  //
  // POST, though it only reads: the token must travel in the BODY. `req.url` is logged
  // verbatim on every request, so a `?token=` would put a live account-takeover credential
  // into the API and proxy logs.
  app.post('/auth/invitation/preview', authLimit, async (request): Promise<InvitationPreviewDto> => {
    const { token } = invitationPreviewSchema.parse(request.body);
    return authService.invitationPreview(token);
  });

  app.get(
    '/auth/me',
    { preHandler: [app.authenticate, app.loadActor] },
    async (request): Promise<MeDto> => {
      const user = await authService.me(request.actor!.userId);
      // Resolved fresh here (not from the token) so the UI reflects a role/grant change on the
      // next /auth/me even before the access token is refreshed.
      const authz = await authService.sessionAuthz(user);
      return {
        userId: user.id,
        role: user.role,
        teamMemberId: user.teamMemberId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        capabilities: authz.capabilities,
        permissions: authz.permissions,
      };
    },
  );
}
