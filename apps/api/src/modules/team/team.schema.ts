/**
 * Edge validation (Zod) + DTOs for the TeamMember (roster) module. Input is
 * validated at the boundary; output goes through `toTeamMemberDto` so raw Prisma
 * rows never leak and money is serialized as minor-unit strings.
 */
import { z } from 'zod';
import { Currency, MinorUnitsNonNeg } from '@hold/shared';

export const createTeamMemberSchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(120),
  // Roster lifecycle. `inactive` here is a status label only — bulk deactivation still soft-
  // deletes via the dedicated endpoint; this lets Editar persona and the active/paused bulk
  // actually persist instead of resetting on reload.
  status: z.enum(['active', 'paused', 'inactive']).default('active'),
  employmentType: z.string().trim().min(1).max(60).default('collaborator'),
  compensationModel: z.string().trim().min(1).max(60).default('monthly_fixed'),
  currency: Currency.default('ARS'),
  hourlyRateMinor: MinorUnitsNonNeg.optional(),
  monthlyAmountMinor: MinorUnitsNonNeg.optional(),
  productionRateMinor: MinorUnitsNonNeg.optional(),
  taxId: z.string().trim().max(40).optional(),
  email: z.string().email().max(254).optional(),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
  startDate: z.coerce.date().optional(),
});
export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>;

export const updateTeamMemberSchema = createTeamMemberSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;

export const listTeamQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const teamIdParamSchema = z.object({ id: z.uuid() });

/**
 * Bank details write body (the `Bank` relation, flattened). Served on its OWN
 * capability-gated route — never inline on the general member DTO — so `teamBankDetails`
 * can close read+write in one line. `alias` arrives as `bankAlias` to avoid clashing with
 * any generic alias. Every field optional: undefined leaves it, '' clears it.
 */
export const bankDetailsSchema = z.object({
  bankName: z.string().trim().max(120).optional(),
  accountHolder: z.string().trim().max(160).optional(),
  cbuOrCvu: z.string().trim().max(40).optional(),
  bankAlias: z.string().trim().max(60).optional(),
});
export type BankDetailsInput = z.infer<typeof bankDetailsSchema>;

/**
 * What an INVITED person tells us about themselves while setting their password.
 *
 * It lives here, with the rest of the ficha, because that is what it writes — `auth` owns
 * consuming the token, not the shape of a team member. Exactly the fields the studio does
 * not know and today chases over WhatsApp; deliberately absent are role, employment type,
 * rates, capacity and status, which are the studio's to decide and which a person must
 * never set about themselves.
 */
export const invitedProfileSchema = bankDetailsSchema.extend({
  phone: z.string().trim().max(40).optional(),
  taxId: z.string().trim().max(40).optional(),
});
export type InvitedProfileInput = z.infer<typeof invitedProfileSchema>;

/** The member's bank details, or null when none is linked. */
export interface BankDto {
  bankName: string | null;
  accountHolder: string | null;
  cbuOrCvu: string | null;
  alias: string | null;
}

export function toBankDto(r: {
  bankName: string | null;
  accountHolder: string | null;
  cbuOrCvu: string | null;
  alias: string | null;
}): BankDto {
  return {
    bankName: r.bankName,
    accountHolder: r.accountHolder,
    cbuOrCvu: r.cbuOrCvu,
    alias: r.alias,
  };
}

export interface TeamMemberDto {
  id: string;
  name: string;
  role: string;
  status: string;
  employmentType: string;
  compensationModel: string;
  currency: string;
  hourlyRateMinor: string | null;
  monthlyAmountMinor: string | null;
  productionRateMinor: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  startDate: string | null;
  /** Whether the member's bank details are complete enough to pay (holder + CBU/CVU).
   *  A derived boolean, NOT the fields — those ride the capability-gated bank route. */
  bankComplete: boolean;
  /** Same derivation, three-valued: `none` = no bank row or nothing on file, `incomplete` =
   *  something on file but no holder or CBU/CVU. The roster badge needs the difference. */
  bankStatus: BankStatus;
  createdAt: string;
}

export type BankStatus = 'complete' | 'incomplete' | 'none';

export interface PaginatedTeamDto {
  items: TeamMemberDto[];
  total: number;
  limit: number;
  offset: number;
}

interface TeamMemberRecord {
  id: string;
  name: string;
  role: string;
  status: string;
  employmentType: string;
  compensationModel: string;
  currency: string;
  hourlyRateMinor: bigint | null;
  monthlyAmountMinor: bigint | null;
  productionRateMinor: bigint | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  startDate: Date | null;
  bank?: {
    bankName: string | null;
    accountHolder: string | null;
    cbuOrCvu: string | null;
    alias: string | null;
  } | null;
  createdAt: Date;
}

/** Mirrors the front's `bankCompleteness`: complete = holder + CBU/CVU present. */
function bankStatusOf(bank: TeamMemberRecord['bank']): BankStatus {
  if (!bank || !(bank.bankName || bank.accountHolder || bank.cbuOrCvu || bank.alias)) return 'none';
  return bank.accountHolder && bank.cbuOrCvu ? 'complete' : 'incomplete';
}

export function toTeamMemberDto(r: TeamMemberRecord): TeamMemberDto {
  const bankStatus = bankStatusOf(r.bank);
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    status: r.status,
    employmentType: r.employmentType,
    compensationModel: r.compensationModel,
    currency: r.currency,
    hourlyRateMinor: r.hourlyRateMinor?.toString() ?? null,
    monthlyAmountMinor: r.monthlyAmountMinor?.toString() ?? null,
    productionRateMinor: r.productionRateMinor?.toString() ?? null,
    taxId: r.taxId,
    email: r.email,
    phone: r.phone,
    notes: r.notes,
    startDate: r.startDate?.toISOString() ?? null,
    bankComplete: bankStatus === 'complete',
    bankStatus,
    createdAt: r.createdAt.toISOString(),
  };
}
