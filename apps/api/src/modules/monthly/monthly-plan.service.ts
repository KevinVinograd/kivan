/**
 * Monthly-plan service — productions / fixed expenses / alerts. Maps rows to DTOs
 * and enforces the version guard (0 rows affected → 404 if gone, else 409 stale).
 */
import type { Prisma } from '@hold/db';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { assertMonthOpen, periodKeyOf } from '../../lib/month-guard.js';
import { billingRepo } from '../billing/billing.repo.js';
import { clientsService } from '../clients/clients.service.js';
import { billingService } from '../billing/billing.service.js';
import { payoutsService } from '../payouts/payouts.service.js';

/**
 * How many rows of each list the month bundle carries.
 *
 * ONE page, not a paginating loop: this assembles inside a transaction that has already
 * exceeded Prisma's budget in production, and N round trips per month would put it back
 * there. 500 matches the cap the generate endpoint already accepts per run, and anything
 * beyond it is REPORTED (`truncated`) rather than silently dropped.
 */
const BUNDLE_LIMIT = 500;
import { teamService } from '../team/team.service.js';
import { monthlyRepo } from './monthly.repo.js';
import { monthBounds, monthlyPaymentsRepo, monthlyPlanRepo } from './monthly-plan.repo.js';
import { repriceHourMonth } from './production-pack.js';
import type {
  AlertDto,
  CreateAlertInput,
  CreateExpenseInput,
  CreateProductionInput,
  ExpenseDto,
  PlanBundleDto,
  ProductionAttributionInput,
  ProductionDto,
  UpdateAlertInput,
  UpdateExpenseInput,
  UpdateProductionInput,
} from './monthly-plan.schema.js';

const day = (d: Date): string => d.toISOString().slice(0, 10);
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function toProductionDto(r: {
  id: string; period: Date; date: Date; clientId: string | null; clientName: string | null;
  title: string; type: string; responsible: string | null; participants: Prisma.JsonValue | null;
  hours: number; viaticsMinor: bigint; totalCostMinor: bigint; billable: string | null;
  billAmountMinor: bigint | null; packHours: number; status: string; notes: string | null; version: number;
  clientServiceId: string | null; receivableId: string | null;
  accountManagerId: string | null; viaticsPaidAt: Date | null; receipt: string | null;
  accountManager?: { name: string } | null;
  participantLinks?: {
    teamMemberId: string; hours: number | null; role: string; teamMember: { name: string };
  }[];
}): ProductionDto {
  return {
    id: r.id, period: day(r.period).slice(0, 7), date: day(r.date),
    clientId: r.clientId, clientName: r.clientName, title: r.title, type: r.type,
    responsible: r.responsible, participants: asStringArray(r.participants),
    attribution: (r.participantLinks ?? []).map((p) => ({
      teamMemberId: p.teamMemberId, name: p.teamMember.name,
      // `?? null` and never `?? 0` — an unrecorded split is not zero hours.
      hours: p.hours ?? null, role: p.role,
    })),
    hours: r.hours, viaticsMinor: r.viaticsMinor.toString(), totalCostMinor: r.totalCostMinor.toString(),
    billable: r.billable, billAmountMinor: r.billAmountMinor?.toString() ?? null,
    packHours: r.packHours, status: r.status, notes: r.notes,
    clientServiceId: r.clientServiceId, receivableId: r.receivableId,
    accountManagerId: r.accountManagerId, accountManagerName: r.accountManager?.name ?? null,
    viaticsPaidAt: r.viaticsPaidAt ? day(r.viaticsPaidAt) : null, receipt: r.receipt,
    version: r.version,
  };
}

/**
 * What the studio owes the people who worked a production: each person's hours × their
 * hourly rate — how HOLD pays its content creators.
 *
 * `undefined` when nobody on it has both hours and a rate: then there is nothing to price
 * and the amount typed on the form (or the stored one) stands. Someone with hours but no
 * rate adds nothing rather than blocking the rest — the form shows the figure, and an
 * operator who knows that person's price types it over.
 */
function costOfAttribution(
  rows: { teamMemberId: string; hours: number | null }[],
  rateById: Map<string, bigint | null>,
): bigint | undefined {
  let total = 0n;
  let priced = false;
  for (const row of rows) {
    const rate = rateById.get(row.teamMemberId);
    if (row.hours == null || row.hours <= 0 || rate == null) continue;
    total += BigInt(Math.round(Number(rate) * row.hours));
    priced = true;
  }
  return priced ? total : undefined;
}

/** The account manager must be a live member of THIS workspace — a foreign id would
 *  otherwise sit on the row as a name nobody here can resolve. */
async function assertAccountManager(tx: Prisma.TransactionClient, id: string | null | undefined): Promise<void> {
  if (!id) return;
  const found = await monthlyPlanRepo.findMembersByIds(tx, [id]);
  if (found.length === 0) {
    throw new BadRequestError(`accountManagerId is not a team member of this workspace: ${id}`);
  }
}

/**
 * A production may be billed under a client's service only if that service is a live
 * PER-PRODUCTION or PER-HOUR line of the SAME client, and the production is marked billable.
 *
 * Checked here because the foreign key cannot: it would happily point a production of
 * client A at client B's price, and the generator would then bill A at B's rate.
 */
async function assertBillableLink(
  tx: Prisma.TransactionClient,
  link: { clientServiceId: string | null | undefined; clientId: string | null; billable: string | null },
): Promise<void> {
  if (!link.clientServiceId) return;
  const line = await tx.clientService.findFirst({
    where: { id: link.clientServiceId, deletedAt: null },
    select: { clientId: true, billingMode: true },
  });
  if (!line || line.clientId !== link.clientId) {
    throw new BadRequestError('El servicio elegido no es de este cliente.');
  }
  if (line.billingMode !== 'per_production' && line.billingMode !== 'per_hour') {
    throw new BadRequestError('Solo se puede vincular un servicio que se cobra por producción o por hora.');
  }
  if (link.billable !== 'billable' && link.billable !== 'both') {
    throw new BadRequestError('Una producción vinculada a un servicio tiene que ser facturable.');
  }
}

/**
 * Re-bill per-hour productions after one was written: in the line + month it left, and in
 * the one it is in now. A per-hour production always bills its hours × the line's price,
 * less the hours the line includes that month (`production-pack.ts`) — whatever amount was
 * typed, because the hour is the unit HOLD sells and a typed total would drift from the
 * hours the moment someone corrects them. A production moved off a per-hour line keeps
 * its typed amount and has nothing covering its hours any more.
 */
async function settlePack(
  tx: Prisma.TransactionClient,
  id: string,
  before: { clientServiceId: string | null; period: Date } | null,
): Promise<void> {
  const after = await tx.production.findFirst({
    where: { id },
    select: { clientServiceId: true, period: true, packHours: true },
  });
  const months = new Map<string, { line: string; period: Date }>();
  for (const at of [before, after]) {
    if (at?.clientServiceId) {
      months.set(`${at.clientServiceId}:${at.period.toISOString()}`, { line: at.clientServiceId, period: at.period });
    }
  }
  let afterIsPerHour = false;
  for (const { line, period } of months.values()) {
    const repriced = await repriceHourMonth(tx, line, period);
    if (line === after?.clientServiceId && period.getTime() === after.period.getTime()) afterIsPerHour = repriced;
  }
  if (after && !afterIsPerHour && after.packHours !== 0) {
    await tx.production.updateMany({ where: { id }, data: { packHours: 0 } });
  }
}

/** A billed production's amount is inside a cobro's base: it cannot change under it. */
function assertNotBilled(existing: { receivableId: string | null } | null): void {
  if (existing?.receivableId) {
    throw new ConflictError('Esta producción ya está en un cobro. Anulá el cobro para editarla.');
  }
}

/**
 * Turn an attribution payload into the rows to persist plus the display names
 * the legacy `responsible` / `participants` columns keep carrying.
 *
 * An id that names nobody in this workspace is REFUSED rather than dropped: a
 * silently ignored participant is a member whose hours vanish from a liquidación
 * with nothing on screen to say why.
 */
async function resolveAttribution(
  tx: Prisma.TransactionClient,
  input: ProductionAttributionInput[],
): Promise<{
  rows: { teamMemberId: string; hours: number | null; role: string }[];
  responsible: string | null;
  participants: string[];
  rateById: Map<string, bigint | null>;
}> {
  const ids = [...new Set(input.map((a) => a.teamMemberId))];
  const members = await monthlyPlanRepo.findMembersByIds(tx, ids);
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const rateById = new Map(members.map((m) => [m.id, m.hourlyRateMinor]));
  const missing = ids.filter((id) => !nameById.has(id));
  if (missing.length > 0) {
    throw new BadRequestError(
      `attribution references team member(s) not in this workspace: ${missing.join(', ')}`,
    );
  }

  // A person twice in one payload is REFUSED, not silently collapsed. The table
  // holds one row per (production, member), so any dedupe here would have to
  // pick a winner and discard the loser's hours — the same silent disappearance
  // the unknown-id refusal above exists to prevent.
  if (ids.length !== input.length) {
    const dupes = [...new Set(input.map((a) => a.teamMemberId).filter((id, i, all) => all.indexOf(id) !== i))];
    throw new BadRequestError(
      `attribution lists the same team member more than once: ${dupes
        .map((id) => nameById.get(id) ?? id)
        .join(', ')}`,
    );
  }

  // Likewise for a second `responsible`. Both would be persisted and both would
  // be summed into a liquidación, but only the first can occupy the single
  // `responsible` column and the rest fall out of `participants` too — so the
  // display names would quietly disagree with who is actually being paid.
  const leads = input.filter((a) => a.role === 'responsible');
  if (leads.length > 1) {
    throw new BadRequestError(
      `a production has one responsible; got ${leads.length}: ${leads
        .map((a) => nameById.get(a.teamMemberId) ?? a.teamMemberId)
        .join(', ')}`,
    );
  }

  const rows = input.map((a) => ({
    teamMemberId: a.teamMemberId,
    hours: a.hours ?? null,
    role: a.role,
  }));

  const lead = rows.find((r) => r.role === 'responsible');
  return {
    rows,
    rateById,
    responsible: lead ? (nameById.get(lead.teamMemberId) ?? null) : null,
    participants: rows
      .filter((r) => r.role === 'participant')
      .map((r) => nameById.get(r.teamMemberId) as string),
  };
}

/**
 * Rebuild a production's attribution from its DISPLAY NAMES, preserving the
 * hours already recorded for anyone who is still on it.
 *
 * This is the other direction of the sync, and it is the one that carries the
 * weight today: no client sends `attribution` yet, so every real edit arrives as
 * names. Without this, migration 0012 backfills attribution rows and the very
 * next save through the existing form leaves them pointing at the person who was
 * REPLACED — the production would read "Bruno" while Bruno's liquidación counted
 * nothing and Ana's kept counting hours she was taken off.
 *
 * Matching is the same rule the backfill uses and for the same reason: exact,
 * modulo case and surrounding whitespace, never fuzzy, and a name two members
 * share attributes to neither. An unmatched name simply creates no row.
 */
async function syncAttributionFromNames(
  tx: Prisma.TransactionClient,
  production: {
    id: string;
    responsible: string | null;
    participants: Prisma.JsonValue | null;
    participantLinks?: { teamMemberId: string; hours: number | null }[];
  },
): Promise<void> {
  const members = await monthlyPlanRepo.listMembersForMatching(tx);
  const byNormalized = new Map<string, string[]>();
  for (const m of members) {
    const key = m.name.trim().toLowerCase();
    byNormalized.set(key, [...(byNormalized.get(key) ?? []), m.id]);
  }
  const resolve = (name: string): string | null => {
    const hits = byNormalized.get(name.trim().toLowerCase());
    return hits && hits.length === 1 ? (hits[0] as string) : null;
  };

  // Hours already recorded survive a rename of the roster around them: someone
  // still on the production keeps their split, someone removed loses their row,
  // someone newly added starts at null (unknown) rather than zero.
  const hoursByMember = new Map(
    (production.participantLinks ?? []).map((p) => [p.teamMemberId, p.hours]),
  );

  const rows: { teamMemberId: string; hours: number | null; role: string }[] = [];
  const seen = new Set<string>();
  const push = (name: string, role: string) => {
    const id = resolve(name);
    if (!id || seen.has(id)) return;
    seen.add(id);
    rows.push({ teamMemberId: id, hours: hoursByMember.get(id) ?? null, role });
  };

  if (production.responsible) push(production.responsible, 'responsible');
  for (const name of asStringArray(production.participants)) push(name, 'participant');

  await monthlyPlanRepo.replaceAttribution(tx, production.id, rows);
}

function toExpenseDto(r: {
  id: string; period: Date; concept: string; category: string; amountMinor: bigint;
  recurrence: string; responsible: string | null; monotributo: string | null; payStatus: string;
  affectsProfitability: boolean; notes: string | null; version: number;
}): ExpenseDto {
  return {
    id: r.id, period: day(r.period).slice(0, 7), concept: r.concept, category: r.category,
    amountMinor: r.amountMinor.toString(), recurrence: r.recurrence, responsible: r.responsible,
    monotributo: r.monotributo, payStatus: r.payStatus, affectsProfitability: r.affectsProfitability,
    notes: r.notes, version: r.version,
  };
}

function toAlertDto(r: {
  id: string; period: Date; severity: string; type: string; entity: string; description: string;
  responsible: string | null; status: string; version: number;
}): AlertDto {
  return {
    id: r.id, period: day(r.period).slice(0, 7), severity: r.severity, type: r.type,
    entity: r.entity, description: r.description, responsible: r.responsible, status: r.status,
    version: r.version,
  };
}

/** Resolve the 0-rows-affected outcome of a guarded write into 404 or 409. */
async function guardResult(affected: number, exists: Promise<unknown>, label: string): Promise<void> {
  if (affected > 0) return;
  if (!(await exists)) throw new NotFoundError(`${label} not found`);
  throw new ConflictError('Stale version — reload and retry');
}

export const monthlyPlanService = {
  // ── Productions ──
  async listProductions(tx: Prisma.TransactionClient, period: string): Promise<ProductionDto[]> {
    const { start, end } = monthBounds(period);
    return (await monthlyPlanRepo.listProductions(tx, start, end)).map(toProductionDto);
  },
  async createProduction(
    tx: Prisma.TransactionClient, period: string, input: CreateProductionInput,
  ): Promise<ProductionDto> {
    await assertMonthOpen(tx, period);
    await assertBillableLink(tx, {
      clientServiceId: input.clientServiceId,
      clientId: input.clientId ?? null,
      billable: input.billable ?? null,
    });
    const { start } = monthBounds(period);
    await assertAccountManager(tx, input.accountManagerId);
    // When ids are supplied they are authoritative and the display names are
    // derived from them, so the two representations can never disagree.
    const attributed = input.attribution ? await resolveAttribution(tx, input.attribution) : null;
    // A typed cost wins; otherwise it is priced from who worked it.
    const totalCostMinor =
      input.totalCostMinor ?? (attributed ? costOfAttribution(attributed.rows, attributed.rateById) : undefined);
    const created = await monthlyPlanRepo.createProduction(tx, {
      period: start, date: input.date,
      clientId: input.clientId ?? null, clientName: input.clientName ?? null,
      title: input.title || input.type, type: input.type,
      responsible: attributed ? attributed.responsible : (input.responsible ?? null),
      participants: attributed ? attributed.participants : (input.participants ?? []),
      hours: input.hours,
      viaticsMinor: input.viaticsMinor, totalCostMinor,
      billable: input.billable ?? null, billAmountMinor: input.billAmountMinor ?? null,
      status: input.status, notes: input.notes ?? null,
      clientServiceId: input.clientServiceId ?? null,
      accountManagerId: input.accountManagerId ?? null,
      viaticsPaidAt: input.viaticsPaidAt ?? null,
      receipt: input.receipt || null,
    });
    if (attributed) {
      await monthlyPlanRepo.replaceAttribution(tx, created.id, attributed.rows);
    } else {
      // Names only — the shape every client sends today. Resolve them the way
      // the 0012 backfill does, so a production created through the existing
      // form is attributable from the moment it exists instead of only after
      // the next migration.
      await syncAttributionFromNames(tx, created);
    }
    await settlePack(tx, created.id, null);
    // Re-read so the DTO carries the attribution and the bill that were just written.
    const row = await monthlyPlanRepo.findProduction(tx, created.id);
    return toProductionDto(row!);
  },
  async updateProduction(
    tx: Prisma.TransactionClient, id: string, input: UpdateProductionInput,
  ): Promise<ProductionDto> {
    const existing = await monthlyPlanRepo.findProduction(tx, id);
    if (existing) await assertMonthOpen(tx, periodKeyOf(existing.period));
    assertNotBilled(existing);
    if (existing) {
      // Validated against the MERGED row: a PATCH that only changes the client, or only
      // un-marks it billable, must not leave a link the generator would bill wrongly.
      // But only when the link actually CHANGES: the form resends every field on every
      // save, and a production linked to a line later removed must still take a notes
      // edit instead of failing a check about a link nobody touched.
      const merged = {
        clientServiceId:
          input.clientServiceId !== undefined ? input.clientServiceId : existing.clientServiceId,
        clientId: input.clientId !== undefined ? input.clientId : existing.clientId,
        billable: input.billable !== undefined ? input.billable : existing.billable,
      };
      const linkChanged =
        merged.clientServiceId !== existing.clientServiceId ||
        merged.clientId !== existing.clientId ||
        merged.billable !== existing.billable;
      if (linkChanged) await assertBillableLink(tx, merged);
    }
    // `attribution` is not a column — destructured out so it never reaches Prisma.
    const { version, date, attribution, totalCostMinor, receipt, ...rest } = input;
    if (rest.title !== undefined && !rest.title) rest.title = rest.type ?? existing?.type ?? 'Producción';
    await assertAccountManager(tx, rest.accountManagerId);
    const attributed = attribution ? await resolveAttribution(tx, attribution) : null;
    // Omitted cost = re-price it from who worked it, so changing the hours moves the cost
    // with them. Only an amount the operator typed overrides that.
    const cost =
      totalCostMinor ?? (attributed ? costOfAttribution(attributed.rows, attributed.rateById) : undefined);
    const affected = await monthlyPlanRepo.updateProduction(tx, id, version, {
      ...rest, ...(date !== undefined ? { date } : {}),
      ...(cost !== undefined ? { totalCostMinor: cost } : {}),
      ...(receipt !== undefined ? { receipt: receipt || null } : {}),
      ...(attributed
        ? { responsible: attributed.responsible, participants: attributed.participants }
        : { participants: rest.participants ?? undefined }),
    });
    await guardResult(affected, monthlyPlanRepo.findProduction(tx, id), `Production ${id}`);
    if (attributed) {
      await monthlyPlanRepo.replaceAttribution(tx, id, attributed.rows);
    } else if (rest.responsible !== undefined || rest.participants !== undefined) {
      // A name-only edit — the only shape any client sends today — must carry
      // the attribution with it. Otherwise reassigning a production through the
      // existing form leaves its rows pointing at the person who was REPLACED,
      // so the production reads one name while a different person's liquidación
      // keeps counting its hours. Re-read first: the merge of a partial payload
      // onto the stored row is what decides the final names.
      const saved = await monthlyPlanRepo.findProduction(tx, id);
      if (saved) await syncAttributionFromNames(tx, saved);
    }
    // From the MERGED link and hours, so editing either one moves the amount with it.
    await settlePack(tx, id, existing);
    const row = await monthlyPlanRepo.findProduction(tx, id);
    return toProductionDto(row!);
  },
  /**
   * Mark viáticos paid back on `paidAt`, or owed again with `null`, several at once.
   *
   * Deliberately NOT behind `assertMonthOpen` or `assertNotBilled`. HOLD pays viáticos
   * weekly — usually after the shoot's month has closed, sometimes after the production
   * reached a cobro — and neither lock is about this field: a closed month freezes what
   * was earned and billed, and paying back a photographer's travel changes neither.
   */
  async markViaticsPaid(
    tx: Prisma.TransactionClient, ids: string[], paidAt: Date | null,
  ): Promise<{ updated: number }> {
    return { updated: await monthlyPlanRepo.markViaticsPaid(tx, [...new Set(ids)], paidAt) };
  },
  /**
   * Approve productions — the communication lead's "se hizo" — or send them back to
   * pending. Only APPROVED productions are billed to the client (Generar mes) and paid to
   * whoever worked them (liquidación): HOLD asked for exactly that check, so a production
   * a client says never happened cannot be billed or paid by accident (reviews of
   * 2026-10-01 and 2026-10-19). A production already on a cobro is left alone, and a
   * closed month takes no approval changes — it is the record of what was billed and paid.
   */
  async setProductionApproval(
    tx: Prisma.TransactionClient, ids: string[], approved: boolean,
  ): Promise<{ updated: number }> {
    const unique = [...new Set(ids)];
    for (const { period } of await monthlyPlanRepo.periodsOf(tx, unique)) {
      await assertMonthOpen(tx, periodKeyOf(period));
    }
    const updated = await monthlyPlanRepo.setApproval(tx, unique, approved);
    // Approved productions use a per-hour line's included hours before pending ones, so an
    // approval moves who is covered and who bills the excess.
    for (const { clientServiceId, period } of await monthlyPlanRepo.lineMonthsOf(tx, unique)) {
      if (clientServiceId) await repriceHourMonth(tx, clientServiceId, period);
    }
    return { updated };
  },

  /**
   * A communication lead works only on the clients they are assigned to. The same lookup the
   * client view uses for an employee, so it answers 404 — not 403 — for any other client and
   * does not disclose that it exists.
   */
  async assertLeadClient(
    tx: Prisma.TransactionClient, clientId: string | null | undefined, teamMemberId: string | null,
  ): Promise<void> {
    if (!clientId) throw new BadRequestError('Elegí el cliente de la producción.');
    await clientsService.getById(tx, clientId, teamMemberId);
  },
  async assertLeadProductions(
    tx: Prisma.TransactionClient, ids: string[], teamMemberId: string | null,
  ): Promise<void> {
    for (const { clientId } of await monthlyPlanRepo.clientsOf(tx, ids)) {
      await this.assertLeadClient(tx, clientId, teamMemberId);
    }
  },

  /** Who a production can name as creator or account manager: id + name, nothing else.
   *  A communication lead's own roster read (`GET /team-members`) returns only themselves,
   *  so without this they could not pick the photographer who shot it. */
  async listProductionPeople(tx: Prisma.TransactionClient): Promise<{ id: string; name: string }[]> {
    return monthlyPlanRepo.listProductionPeople(tx);
  },

  /** One client's productions over the last `months` months, newest first — the history
   *  the client view shows. */
  async listClientProductions(
    tx: Prisma.TransactionClient, clientId: string, months = 6,
  ): Promise<ProductionDto[]> {
    const now = new Date();
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
    return (await monthlyPlanRepo.listClientProductions(tx, clientId, since)).map(toProductionDto);
  },
  async deleteProduction(
    tx: Prisma.TransactionClient, id: string, version: number,
  ): Promise<void> {
    const existing = await monthlyPlanRepo.findProduction(tx, id);
    if (existing) await assertMonthOpen(tx, periodKeyOf(existing.period));
    assertNotBilled(existing);
    const affected = await monthlyPlanRepo.softDeleteProduction(tx, id, version);
    await guardResult(affected, monthlyPlanRepo.findProduction(tx, id), `Production ${id}`);
    // Its hours stop using the line's included hours; the month's others take them back.
    if (existing?.clientServiceId) await repriceHourMonth(tx, existing.clientServiceId, existing.period);
  },

  // ── Fixed expenses ──
  async listExpenses(tx: Prisma.TransactionClient, period: string): Promise<ExpenseDto[]> {
    const { start, end } = monthBounds(period);
    return (await monthlyPlanRepo.listExpenses(tx, start, end)).map(toExpenseDto);
  },
  async createExpense(
    tx: Prisma.TransactionClient, period: string, input: CreateExpenseInput,
  ): Promise<ExpenseDto> {
    await assertMonthOpen(tx, period);
    const { start } = monthBounds(period);
    const created = await monthlyPlanRepo.createExpense(tx, {
      period: start, concept: input.concept, category: input.category,
      amountMinor: input.amountMinor, recurrence: input.recurrence,
      responsible: input.responsible ?? null, monotributo: input.monotributo ?? null,
      payStatus: input.payStatus, affectsProfitability: input.affectsProfitability,
      notes: input.notes ?? null,
    });
    return toExpenseDto(created);
  },
  async updateExpense(
    tx: Prisma.TransactionClient, id: string, input: UpdateExpenseInput,
  ): Promise<ExpenseDto> {
    const existing = await monthlyPlanRepo.findExpense(tx, id);
    if (existing) await assertMonthOpen(tx, periodKeyOf(existing.period));
    const { version, ...rest } = input;
    const affected = await monthlyPlanRepo.updateExpense(tx, id, version, rest);
    await guardResult(affected, monthlyPlanRepo.findExpense(tx, id), `Expense ${id}`);
    const row = await monthlyPlanRepo.findExpense(tx, id);
    return toExpenseDto(row!);
  },
  async deleteExpense(tx: Prisma.TransactionClient, id: string, version: number): Promise<void> {
    const existing = await monthlyPlanRepo.findExpense(tx, id);
    if (existing) await assertMonthOpen(tx, periodKeyOf(existing.period));
    const affected = await monthlyPlanRepo.softDeleteExpense(tx, id, version);
    await guardResult(affected, monthlyPlanRepo.findExpense(tx, id), `Expense ${id}`);
  },

  // ── Alerts ──
  async listAlerts(tx: Prisma.TransactionClient, period: string): Promise<AlertDto[]> {
    const { start, end } = monthBounds(period);
    return (await monthlyPlanRepo.listAlerts(tx, start, end)).map(toAlertDto);
  },
  async createAlert(
    tx: Prisma.TransactionClient, period: string, input: CreateAlertInput,
  ): Promise<AlertDto> {
    await assertMonthOpen(tx, period);
    const { start } = monthBounds(period);
    const created = await monthlyPlanRepo.createAlert(tx, {
      period: start, severity: input.severity, type: input.type,
      entity: input.entity, description: input.description,
      responsible: input.responsible ?? null, status: input.status,
    });
    return toAlertDto(created);
  },
  async updateAlert(
    tx: Prisma.TransactionClient, id: string, input: UpdateAlertInput,
  ): Promise<AlertDto> {
    const existing = await monthlyPlanRepo.findAlert(tx, id);
    if (existing) await assertMonthOpen(tx, periodKeyOf(existing.period));
    const { version, ...rest } = input;
    const affected = await monthlyPlanRepo.updateAlert(tx, id, version, rest);
    await guardResult(affected, monthlyPlanRepo.findAlert(tx, id), `Alert ${id}`);
    const row = await monthlyPlanRepo.findAlert(tx, id);
    return toAlertDto(row!);
  },
  async deleteAlert(tx: Prisma.TransactionClient, id: string, version: number): Promise<void> {
    const existing = await monthlyPlanRepo.findAlert(tx, id);
    if (existing) await assertMonthOpen(tx, periodKeyOf(existing.period));
    const affected = await monthlyPlanRepo.softDeleteAlert(tx, id, version);
    await guardResult(affected, monthlyPlanRepo.findAlert(tx, id), `Alert ${id}`);
  },

  // ── Checklist ──
  async setChecklist(
    tx: Prisma.TransactionClient, period: string, item: string, value: boolean,
  ): Promise<Record<string, boolean>> {
    await assertMonthOpen(tx, period);
    const rec = await monthlyRepo.ensureRecord(tx, period);
    const current = (rec.checklist as Record<string, boolean> | null) ?? {};
    const next = { ...current, [item]: value };
    await tx.monthRecord.update({ where: { id: rec.id }, data: { checklist: next } });
    return next;
  },

  // ── The assembled plan bundle (one read for the whole monthly page) ──
  /** One page, deliberately: see the note on `truncated` in the return. */
  async getBundle(
    tx: Prisma.TransactionClient, period: string,
  ): Promise<PlanBundleDto> {
    const { start, end } = monthBounds(period);
    const [
      rec, receivables, payouts, productions, expenses, alerts, emitters, members,
      paymentTotals, payments, teamPaymentTotals, otherLanePaymentCount,
    ] =
      await Promise.all([
        monthlyRepo.findRecord(tx, period),
        // 500, matching the cap the month generator already accepts per run, and the
        // `total` each of these returns is KEPT rather than discarded — see `truncated`
        // below. At 100 a studio's 101st cobro fell out of the month's revenue, out of
        // its profitability, out of the table AND out of `closeBlockers`, with nothing
        // anywhere saying so: it could hide a real validation or shrink the billing,
        // and both look like a clean month.
        billingService.list(tx, { limit: BUNDLE_LIMIT, offset: 0, period: start }),
        payoutsService.list(tx, { limit: BUNDLE_LIMIT, offset: 0, period: start }),
        this.listProductions(tx, period),
        this.listExpenses(tx, period),
        this.listAlerts(tx, period),
        billingService.listEmitters(tx),
        teamService.list(tx, { limit: BUNDLE_LIMIT, offset: 0 }),
        // The month's cost side. The TOTALS are an unbounded groupBy on purpose: they are
        // what profitability subtracts, and a total that quietly omits rows overstates
        // profit. The row list is capped like everything else here, because a short TABLE
        // is visible and a short TOTAL is not.
        monthlyPaymentsRepo.paymentTotalsByType(tx, start, end),
        monthlyPaymentsRepo.listPayments(tx, start, end, BUNDLE_LIMIT),
        monthlyPaymentsRepo.teamPaymentTotalsByMember(tx, start, end),
        monthlyPaymentsRepo.otherLanePaymentCount(tx, start, end),
      ]);
    // Monotributo watch: annual issued per emitter (this period's calendar year).
    const [y] = period.split('-').map(Number);
    const yearStart = new Date(Date.UTC(y as number, 0, 1));
    const yearEnd = new Date(Date.UTC((y as number) + 1, 0, 1));
    const monotributo = await Promise.all(
      emitters.map(async (e) => ({
        code: e.code,
        label: e.label,
        annualBilledMinor: (
          await billingRepo.issuedMinorInWindow(tx, e.id, yearStart, yearEnd)
        ).toString(),
        annualLimitMinor: e.annualLimitMinor,
      })),
    );
    // A page of the month is not the month. Reported rather than papered over: the
    // front turns this into a close blocker, because a month whose figures are missing
    // rows must not be signed off — and paginating here instead would put N round trips
    // inside a transaction that has already been over its budget in production.
    const truncated =
      receivables.total > receivables.items.length || payouts.total > payouts.items.length;
    return {
      period,
      status: rec?.status ?? 'draft',
      checklist: (rec?.checklist as Record<string, boolean> | null) ?? {},
      truncated,
      receivables: receivables.items,
      payouts: payouts.items,
      productions,
      expenses,
      alerts,
      monotributo,
      members: members.items.map((m) => ({ id: m.id, name: m.name, role: m.role })),
      paymentTotals: paymentTotals.map((row) => ({
        recipientType: row.recipientType,
        totalMinor: (row._sum.totalAmountMinor ?? 0n).toString(),
        paidMinor: (row._sum.paidAmountMinor ?? 0n).toString(),
        count: row._count._all,
      })),
      teamPaymentTotals: teamPaymentTotals.map((row) => ({
        teamMemberId: row.teamMemberId,
        totalMinor: (row._sum.totalAmountMinor ?? 0n).toString(),
        paidMinor: (row._sum.paidAmountMinor ?? 0n).toString(),
      })),
      payments: payments.map((p) => ({
        id: p.id,
        recipientType: p.recipientType,
        recipientName: p.recipientName,
        concept: p.concept,
        totalMinor: p.totalAmountMinor.toString(),
        paidMinor: p.paidAmountMinor.toString(),
        status: p.status,
        // Calendar days, both of them. The payments module serializes `paymentDate` as a
        // full UTC instant, which a UTC-3 browser renders as the PREVIOUS day; this bundle
        // feeds a month-end screen where the day is the whole point.
        expectedDate: p.expectedDate ? p.expectedDate.toISOString().slice(0, 10) : null,
        paymentDate: p.paymentDate ? p.paymentDate.toISOString().slice(0, 10) : null,
      })),
      otherLanePaymentCount,
    };
  },
};
