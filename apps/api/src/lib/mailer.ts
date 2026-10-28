/**
 * Transactional mail (nodemailer over SES SMTP), for the member set-password
 * invitation. Gated by MAIL_ENABLED: when off — or SMTP is unconfigured — the
 * send is a no-op that reports `{ mailed: false }`, so the caller falls back to
 * handing the one-time link over on-screen (how the invite flow worked before
 * mail existed). A transient SMTP failure degrades the same way, never breaking
 * the member creation that already happened.
 */
import nodemailer from 'nodemailer';
import { childLogger, env } from '@hold/config';

type Transport = ReturnType<typeof nodemailer.createTransport>;

// undefined = not resolved yet; null = mail disabled/unconfigured.
let transporter: Transport | null | undefined;

function getTransporter(): Transport | null {
  if (transporter !== undefined) return transporter;
  if (!env.MAIL_ENABLED || !env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
    transporter = null;
    return null;
  }
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return transporter;
}

export interface InvitationEmailInput {
  to: string;
  firstName: string;
  url: string;
  ttlHours: number;
}

/**
 * Sends the set-password invitation. Returns whether it actually went out.
 *
 * `userId` is who a failure belongs to — the admin who triggered the invite, or the
 * account a self-service reset was asked for. It exists because this runs BELOW the
 * route layer, where `request.log` is out of reach: without it a bounced send is the
 * one line in the flow that names nobody, and the send is exactly the step whose
 * failure someone has to be told about.
 */
export async function sendInvitationEmail(
  input: InvitationEmailInput,
  userId: string,
): Promise<{ mailed: boolean }> {
  const tx = getTransporter();
  if (!tx) return { mailed: false };
  try {
    await tx.sendMail({
      from: `"${env.MAIL_FROM_NAME}" <${env.MAIL_FROM}>`,
      to: input.to,
      subject: 'Creá tu contraseña en hold',
      text: invitationText(input),
      html: invitationHtml(input),
    });
    return { mailed: true };
  } catch (err) {
    childLogger(userId).error({ err }, 'invitation email failed to send');
    return { mailed: false };
  }
}

/** Sends a password-reset link (owner/admin triggered it for a locked-out member). Same
 *  transport + fallback as the invitation; only the copy differs. `userId` attributes a
 *  failure, exactly as above. */
export async function sendPasswordResetEmail(
  input: InvitationEmailInput,
  userId: string,
): Promise<{ mailed: boolean }> {
  const tx = getTransporter();
  if (!tx) return { mailed: false };
  try {
    await tx.sendMail({
      from: `"${env.MAIL_FROM_NAME}" <${env.MAIL_FROM}>`,
      to: input.to,
      subject: 'Restablecé tu contraseña en hold',
      text: resetText(input),
      html: resetHtml(input),
    });
    return { mailed: true };
  } catch (err) {
    childLogger(userId).error({ err }, 'password-reset email failed to send');
    return { mailed: false };
  }
}

function resetText({ firstName, url, ttlHours }: InvitationEmailInput): string {
  return [
    `Hola ${firstName},`,
    '',
    'Pediste (o alguien de tu equipo pidió) restablecer tu contraseña en hold. Entrá al',
    'siguiente link para elegir una nueva:',
    url,
    '',
    `El link vence en ${ttlHours} horas.`,
    '',
    'Si no esperabas este mail, ignoralo: tu contraseña actual sigue funcionando.',
  ].join('\n');
}

function resetHtml({ firstName, url, ttlHours }: InvitationEmailInput): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px">
    <p style="font-size:15px;line-height:1.5">Hola ${escapeHtml(firstName)},</p>
    <p style="font-size:15px;line-height:1.5">Restablecé tu contraseña en <strong>hold</strong>:</p>
    <p style="margin:28px 0">
      <a href="${escapeHtml(url)}" style="display:inline-block;background:#1c1917;color:#fafaf9;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:15px;font-weight:600">Elegir nueva contraseña</a>
    </p>
    <p style="font-size:13px;line-height:1.5;color:#78716c">El link vence en ${ttlHours} horas. Si no esperabas este mail, ignoralo: tu contraseña actual sigue funcionando.</p>
    <p style="font-size:12px;color:#a8a29e;word-break:break-all">${escapeHtml(url)}</p>
  </div>
</body></html>`;
}

function invitationText({ firstName, url, ttlHours }: InvitationEmailInput): string {
  return [
    `Hola ${firstName},`,
    '',
    'Te crearon una cuenta en hold. Entrá al siguiente link para crear tu contraseña:',
    url,
    '',
    `El link vence en ${ttlHours} horas.`,
    '',
    'Si no esperabas este mail, ignoralo.',
  ].join('\n');
}

function invitationHtml({ firstName, url, ttlHours }: InvitationEmailInput): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px">
    <p style="font-size:15px;line-height:1.5">Hola ${escapeHtml(firstName)},</p>
    <p style="font-size:15px;line-height:1.5">Te crearon una cuenta en <strong>hold</strong>. Creá tu contraseña para entrar:</p>
    <p style="margin:28px 0">
      <a href="${escapeHtml(url)}" style="display:inline-block;background:#1c1917;color:#fafaf9;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:15px;font-weight:600">Crear mi contraseña</a>
    </p>
    <p style="font-size:13px;line-height:1.5;color:#78716c">El link vence en ${ttlHours} horas. Si no esperabas este mail, ignoralo.</p>
    <p style="font-size:12px;color:#a8a29e;word-break:break-all">${escapeHtml(url)}</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
