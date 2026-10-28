/**
 * Role capabilities — the SINGLE source of truth for what each role may see and
 * do, shared by the API (`apps/api`) and the web (`apps/web`).
 *
 * Why this exists instead of `role === 'owner'` scattered across the code: the
 * owner/admin line has moved before and will move again. When it lived in ~30
 * separate comparisons, the two sides drifted — the UI hid a column while the
 * API happily served the same field one click deeper, and the docs described a
 * boundary that the code had stopped enforcing. Naming each capability once, in
 * a table both sides read, makes the boundary a decision you can change in one
 * line and read off in one place.
 *
 * TODAY: `owner` and `admin` are at full parity — an admin sees the studio's
 * money exactly as the owner does. The table below is not a formality: flip a
 * capability to `false` for `admin` and both the UI affordance and the server
 * gate close together, because both read this map.
 *
 * NOT modelled here: account governance (who may deactivate or demote whom).
 * That is a relationship between the ACTOR and the TARGET, not a static grant,
 * so it lives with the invariants it protects in `settings.service.ts`.
 */
import type { Role } from './enums.js';

/**
 * A named thing a role may see or do. Each value must describe a capability in
 * product terms, not a screen — several screens usually share one capability.
 */
export type Capability =
  /** Per-client cost vs. revenue: margin %, cost/profit breakdowns, the
   *  Rentabilidad report tab, and the client risk band derived from it. */
  | 'profitability'
  /** The studio's own money band: billed / collected / paid totals, the P&L
   *  figures on Resumen, and the estimated profitability of a month. */
  | 'studioFinancials'
  /** What each team member costs: per-member period cost, cost per hour, and
   *  the aggregate estimated payroll. */
  | 'teamCost'
  /** Team members' banking details (bank, account holder, CBU/CVU, alias) —
   *  personal data of third parties, kept separate from the studio's own money
   *  so it can be closed on its own. */
  | 'teamBankDetails';

const ALL_CAPABILITIES: readonly Capability[] = [
  'profitability',
  'studioFinancials',
  'teamCost',
  'teamBankDetails',
] as const;

/**
 * Which capabilities each role holds.
 *
 * `employee` holds none by design: the Equipo perspective is money-free, and
 * that is a product invariant rather than a setting to tune — an employee must
 * never read another person's pay or a client's margin.
 */
export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  owner: ALL_CAPABILITIES,
  admin: ALL_CAPABILITIES,
  employee: [],
};

/** Whether `role` holds `capability`. The built-in-role form (no custom role in play). */
export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

/**
 * The four "money switch" permission keys the custom-role catalogue uses, mapped 1:1 to the
 * Capabilities the backend enforces (`settings-roles-data.ts` MONEY_SWITCHES says so
 * outright). A custom role's `grants` are `resource.action` strings; these four flip a money
 * VISIBILITY capability (gating columns/figures). The rest of the catalogue is enforced as
 * ACTION gates — `requirePermission` on the backend, `canDo` / `canAccessPath` on the front —
 * not through capabilities. Per-permission enforceability still varies (enforced /
 * display-only / inert); `settings-roles-data.ts` is the source of that mapping.
 */
export const CAPABILITY_BY_GRANT: Record<string, Capability> = {
  'client.profitability.read': 'profitability',
  'report.financials.read': 'studioFinancials',
  'member.compensation.read': 'teamCost',
  'member.bank.read': 'teamBankDetails',
};

/**
 * The capabilities in force for a session. THE INVARIANT: with no custom role assigned
 * (`grants === null`) this is exactly `ROLE_CAPABILITIES[role]` — identical to before the
 * engine existed, so owner/admin/employee behave unchanged. With a custom role, the four
 * money capabilities are the grants INTERSECTED with the built-in role's set: a custom role
 * can only NARROW, never escalate, so assigning one can never grant more than the base role.
 */
export function effectiveCapabilities(role: Role, grants: readonly string[] | null): Capability[] {
  const base = ROLE_CAPABILITIES[role];
  if (grants === null) return [...base];
  const granted = new Set(
    grants.map((g) => CAPABILITY_BY_GRANT[g]).filter((c): c is Capability => c !== undefined),
  );
  return base.filter((c) => granted.has(c));
}

/** Whether a resolved capability set holds `capability`. The session-aware form of `can`. */
export function hasCapability(
  capabilities: readonly Capability[],
  capability: Capability,
): boolean {
  return capabilities.includes(capability);
}
