/** Edge validation (Zod) + DTOs for the Settings module (workspace/users/profile). */
import { z } from 'zod';
import { Currency } from '@hold/shared';
import { emailSchema } from '../../lib/email.js';

/** A studio-defined vocabulary entry (an expense category or a production type). */
const vocabularyEntry = z.string().trim().min(1).max(60);

/**
 * Monthly-operation rules. Stored as one JSON document on the workspace and validated
 * here on every write, so the blob can never drift into a shape the app cannot read.
 * Every field is required once `monthlyRules` is sent: a partial document would leave
 * the reader guessing whether an absent rule means "unset" or "off".
 */
export const monthlyRulesSchema = z.object({
  /** Day of the month the operation closes (1–28: every month has a 28th). */
  closeDay: z.number().int().min(1).max(28),
  closeReminder: z.boolean(),
  /** Days BEFORE the close the reminder fires. */
  reminderDays: z.number().int().min(0).max(30),
  autoReminders: z.boolean(),
  /** Day of the month the team is paid. */
  payDay: z.number().int().min(1).max(28),
  requireApproval: z.boolean(),
  expenseCategories: z.array(vocabularyEntry).max(50),
  productionTypes: z.array(vocabularyEntry).max(50),
});
export type MonthlyRules = z.infer<typeof monthlyRulesSchema>;

export const updateWorkspaceSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    monthlyRules: monthlyRulesSchema.optional(),
    timezone: z.string().trim().max(60).optional(),
    defaultCurrency: Currency.optional(),
    fiscalLegalName: z.string().trim().max(200).optional(),
    fiscalTaxId: z.string().trim().max(40).optional(),
    monotributoCategory: z.string().trim().max(10).optional(),
    // The Cashflow "Fecha de la posición" anchor (Workspace.positionAsOf). Accepts a
    // date-only string (coerced to a Date); null clears it back to the default anchor.
    positionAsOf: z.coerce.date().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;

export const inviteUserSchema = z.object({
  // Normalized at the edge so `@@unique([email])` actually means one person.
  // Postgres compares text case-sensitively, so without this "Flor@x.com" and "flor@x.com"
  // create two independent members that look identical in the UI — and whoever signs in
  // with the other casing gets a clean 401 with the right password.
  email: emailSchema,
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  // Only admin/employee can be invited; ownership moves via a transfer (later).
  role: z.enum(['admin', 'employee']),
  // Optionally link this login to a roster person (`TeamMember`). This is what makes the
  // employee self-view resolve — `me.teamMemberId` anchors "my clients / my hours". The
  // link is 1:1 (`User.teamMemberId` is unique); the service checks the member exists in the
  // workspace and is not already taken.
  teamMemberId: z.uuid().optional(),
  // No password here: the member sets their own via the emailed invitation link
  // (or the on-screen fallback link when mail is off). See settings.service.inviteUser.
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const changeRoleSchema = z.object({ role: z.enum(['admin', 'employee']) });

/** Deactivate / reactivate a member. A disabled user cannot log in or refresh. */
export const changeStatusSchema = z.object({ status: z.enum(['active', 'disabled']) });
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

/** Change your OWN password. The current one is required so a stolen access token
 *  cannot silently take over the account. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;


export const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const userIdParamSchema = z.object({ id: z.uuid() });

export interface WorkspaceDto {
  id: string;
  name: string;
  timezone: string;
  defaultCurrency: string;
  fiscalLegalName: string | null;
  fiscalTaxId: string | null;
  monotributoCategory: string | null;
  /** Cashflow position anchor as a date-only string (YYYY-MM-DD), or null if unset. */
  positionAsOf: string | null;
  /** Monthly-operation rules, or null when never configured (the app uses its defaults). */
  monthlyRules: MonthlyRules | null;
}

export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  teamMemberId: string | null;
  /** The custom WorkspaceRole assigned to this user, if any (null = built-in role only). */
  workspaceRoleId: string | null;
}

interface WorkspaceRecord {
  id: string;
  name: string;
  timezone: string;
  defaultCurrency: string;
  fiscalLegalName: string | null;
  fiscalTaxId: string | null;
  monotributoCategory: string | null;
  positionAsOf: Date | null;
  monthlyRules: unknown;
}

export function toWorkspaceDto(r: WorkspaceRecord): WorkspaceDto {
  return {
    id: r.id,
    name: r.name,
    timezone: r.timezone,
    defaultCurrency: r.defaultCurrency,
    fiscalLegalName: r.fiscalLegalName,
    fiscalTaxId: r.fiscalTaxId,
    monotributoCategory: r.monotributoCategory,
    // Serialize to date-only: the anchor is a calendar day, and the front DatePicker
    // works in 'YYYY-MM-DD' — a full ISO timestamp would drift by timezone on the way back.
    positionAsOf: r.positionAsOf ? r.positionAsOf.toISOString().slice(0, 10) : null,
    // Re-validated on the way OUT too: the column is JSON, so a document written before a
    // rule was added (or by hand) must not reach the client as a half-shape it will read
    // as configured. Anything that does not parse reads as "never configured".
    monthlyRules: monthlyRulesSchema.safeParse(r.monthlyRules).data ?? null,
  };
}

interface UserRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  teamMemberId: string | null;
  roleId: string | null;
}

export function toUserDto(r: UserRecord): UserDto {
  return {
    workspaceRoleId: r.roleId,
    id: r.id,
    email: r.email,
    firstName: r.firstName,
    lastName: r.lastName,
    role: r.role,
    status: r.status,
    teamMemberId: r.teamMemberId,
  };
}

