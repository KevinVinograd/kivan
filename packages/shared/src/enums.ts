/**
 * Canonical domain enums, as Zod enums. These are the SINGLE source of the
 * enum value sets shared by the API (`apps/api`) and the web (`apps/web`).
 *
 * Value parity with the Prisma enums (`packages/db/prisma/schema.prisma`) is
 * load-bearing, and ORDER parity with them is too — a Postgres enum sorts by its
 * declaration order. Change both together.
 *
 * Keep ONLY stable value strings here — never localized UI copy (that lives in
 * apps/web).
 */
import { z } from 'zod';

export const Role = z.enum(['owner', 'admin', 'employee']);
export type Role = z.infer<typeof Role>;

/**
 * ARS and USD only.
 *
 * `FCI` was here from the first schema commit and it was never a currency: a Fondo Común
 * de Inversión is a PLACE money sits, and what it is worth is in pesos. It arrived because
 * the treasury model was transcribed from the administradora's spreadsheet, which has a
 * column per place — and a spreadsheet column became an enum value.
 *
 * Production carried ZERO FCI rows on every table typed by this enum (receivables,
 * payments, clients, team members, ledger entries), measured before the change. The only
 * FCI data anywhere was a balance on two treasury accounts, which is exactly the shape of
 * an account rather than a currency.
 */
export const Currency = z.enum(['ARS', 'USD']);
export type Currency = z.infer<typeof Currency>;

export const ClientStatus = z.enum(['active', 'onboarding', 'paused', 'churned']);
export type ClientStatus = z.infer<typeof ClientStatus>;

/**
 * How a priced service line becomes money (`ClientService.billingMode`). Only `monthly`
 * lines form the client's fee; `one_time` is billed in parts on demand; `per_production`
 * is a unit price billed through the productions linked to it; `per_hour` is a price per
 * production hour, billed as hours × price through the same link.
 */
export const ServiceBillingMode = z.enum(['monthly', 'one_time', 'per_production', 'per_hour']);
export type ServiceBillingMode = z.infer<typeof ServiceBillingMode>;

export const CollectionStatus = z.enum([
  'pending',
  'collected',
  'partial',
  'overdue',
  'cancelled',
]);
export type CollectionStatus = z.infer<typeof CollectionStatus>;

export const BillingStatus = z.enum([
  'no_invoice',
  'pending',
  'invoiced',
  'sent',
  'error_arca',
  'manual',
  'not_required',
]);
export type BillingStatus = z.infer<typeof BillingStatus>;

export const PaymentStatus = z.enum([
  'pending',
  'approved',
  'paid',
  'partial',
  'overdue',
  'cancelled',
]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

/**
 * The payout-statement lifecycle, forward-only: draft → approved → dispatched →
 * confirmed. Its authority is `PayoutStatement.statementStatus`, a plain String
 * column (`packages/db/prisma/schema.prisma`) whose legal values the API repeats as
 * a local tuple (`apps/api/src/modules/payouts/payouts.schema.ts`). Declared here so
 * the web app validates the value instead of casting `string`; the API keeping its
 * own copy is tracked drift, not a second source of truth.
 */
export const PayoutStatementStatus = z.enum(['draft', 'approved', 'dispatched', 'confirmed']);
export type PayoutStatementStatus = z.infer<typeof PayoutStatementStatus>;

export const RecipientType = z.enum([
  'collaborator',
  'provider',
  'employee',
  'fixed_expense',
  'monotributo',
  'platform',
]);
export type RecipientType = z.infer<typeof RecipientType>;

export const AssignmentStatus = z.enum(['active', 'paused', 'ended']);
export type AssignmentStatus = z.infer<typeof AssignmentStatus>;

export const MonthStatus = z.enum(['draft', 'review', 'closed', 'reopened']);
export type MonthStatus = z.infer<typeof MonthStatus>;

export const TreasuryPartner = z.enum(['vicky', 'flor', 'more', 'shared']);
export type TreasuryPartner = z.infer<typeof TreasuryPartner>;

export const LedgerEntryType = z.enum([
  'charge',
  'collection',
  'generated',
  'payment',
  'adjustment',
  'reversal',
]);
export type LedgerEntryType = z.infer<typeof LedgerEntryType>;

/**
 * The area a person works in for a given client — a CLOSED list.
 *
 * It replaced the free-text "rol en el cliente" after the 2026-10-01 review with HOLD.
 * Typed by hand, the same role reached the database as "Diseñadora gráfica" and
 * "Diseñadora Grafica", "Editora" and "editora", and nothing could group or filter on
 * it. HOLD chose areas over job titles — the role inside an area is implied (Producción
 * means the photographers) — and Paid Media is on the list because three live
 * assignments do that work and fit none of the other four.
 *
 * Rows written before the list keep their old text: the API validates new writes only,
 * so nothing breaks and nothing is rewritten behind anyone's back. The values are
 * user-facing copy, hence Spanish.
 */
export const ASSIGNMENT_AREAS = [
  'Administración',
  'Producción',
  'Comunicación',
  'Diseño',
  'Paid Media',
] as const;
export const AssignmentArea = z.enum(ASSIGNMENT_AREAS);
export type AssignmentArea = z.infer<typeof AssignmentArea>;
