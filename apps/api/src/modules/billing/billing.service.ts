/**
 * Billing service — business logic + DTO mapping. Money totals are ALWAYS
 * re-derived here (base + extra − discount); the client-sent total is never
 * trusted. Collection and invoicing are atomic (see billing.repo.ts).
 */
import type { Prisma } from '@hold/db';
import { minor, type CollectionStatus } from '@hold/shared';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { convertToArsMinor } from '../../lib/fx.js';
import { tryRecordIdempotencyKey } from '../../lib/idempotency.js';
import { appendLedger } from '../../lib/ledger.js';
import { postTreasuryMovement } from '../../lib/treasury-posting.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { billingRepo } from './billing.repo.js';
import {
  toReceivableDto,
  type CreateReceivableInput,
  type ExchangeRateDto,
  type GenerateMonthlyFeesInput,
  type InvoiceEmitterDto,
  type ListReceivablesQuery,
  type MonthlyFeeCandidateDto,
  type MonthlyFeeGenerationDto,
  type MonthlyFeePreviewDto,
  type MonthlyFeeSkipReason,
  type PaginatedReceivablesDto,
  type ReceivableClientFields,
  type ReceivableDto,
  type ReceivableKpisDto,
  type ServiceLineChargeInput,
  type SetExchangeRateInput,
  type UpdateReceivableInput,
} from './billing.schema.js';

/**
 * What a cobro remembers about a conversion: the price as agreed with the client, and the
 * rate that turned it into the total actually being billed.
 *
 * INTERNAL. No route schema accepts these fields, so they can only be produced here, from
 * a rate read out of the database in the same transaction. A browser cannot claim a cobro
 * was converted, nor at what rate.
 */
interface FxStamp {
  originalCurrency: string;
  originalAmountMinor: bigint;
  fxRateMinor: bigint;
}

/**
 * What to bill a client, given their retainer and the month's rate. `null` means "cannot
 * be billed this month": the retainer is in a foreign currency and no rate is loaded.
 *
 * ONE function for both the preview and the write, on purpose. The dialog shows a figure
 * and the generator writes one; if those were computed in two places they would eventually
 * disagree, and the operator would approve one amount and bill another.
 *
 * Only USD converts, because ARS-per-USD is the only rate there is. Anything else keeps
 * today's behaviour and is billed in its own currency rather than silently repriced.
 */
function priceFor(
  monthlyFeeMinor: bigint,
  currency: string,
  rate: { arsPerUsdMinor: bigint } | null,
): { baseAmountMinor: bigint; currency: string; fx: FxStamp | null } | null {
  if (currency !== 'USD') {
    return { baseAmountMinor: monthlyFeeMinor, currency, fx: null };
  }
  if (!rate) return null;
  return {
    baseAmountMinor: convertToArsMinor(monthlyFeeMinor, rate.arsPerUsdMinor),
    currency: 'ARS',
    fx: {
      originalCurrency: 'USD',
      originalAmountMinor: monthlyFeeMinor,
      fxRateMinor: rate.arsPerUsdMinor,
    },
  };
}

/**
 * The centavos a client's standing discount takes off one cobro.
 *
 * Applied to the ALREADY-CONVERTED base, so a dollar client's discount lands in the
 * currency the cobro is billed in rather than the one the contract is written in.
 * Floor division: a rate that does not divide evenly loses the fraction rather than
 * billing a centavo that cannot be collected.
 *
 * The percentage itself never reaches a Receivable. The row stores the resolved
 * amount in `discountAmountMinor`, which is what `deriveTotal` subtracts and what every
 * downstream figure already reads — so a later change to a client's rate cannot
 * retroactively restate a cobro that was already issued.
 */
function discountFor(baseAmountMinor: bigint, discountPercentBp: number | null): bigint {
  if (!discountPercentBp) return 0n;
  return (baseAmountMinor * BigInt(discountPercentBp)) / 10_000n;
}

/** A priced service on its way onto a cobro, in the CONTRACT's currency. */
export interface ReceivableLineDraft {
  /** Null only for a hand-typed retainer billed alongside productions (see the generator). */
  clientServiceId: string | null;
  name: string;
  contractedMinor: bigint;
  sortOrder: number;
}

/**
 * Spread a cobro's base across its lines so the parts add up to the whole, exactly.
 *
 * For a peso cobro this is the identity — each line keeps its contracted amount and
 * they already sum to the base. For a converted one it cannot be: `convertToArsMinor`
 * rounds half-up PER CALL, so converting each line independently gives a set whose sum
 * differs from the converted total by a few centavos, and a cobro whose lines do not
 * equal its own amount is worse than one with no lines at all.
 *
 * So the base is authoritative and the LAST line absorbs the difference. The remainder
 * is at most a centavo per line, and putting it anywhere other than one deterministic
 * place would make the same cobro reconcile differently on two reads.
 */
function spreadLines(
  lines: ReceivableLineDraft[],
  baseAmountMinor: bigint,
  converted: boolean,
): { clientServiceId: string | null; name: string; amountMinor: bigint; originalAmountMinor: bigint | null; sortOrder: number }[] {
  if (lines.length === 0) return [];
  const contractedTotal = lines.reduce((sum, l) => sum + l.contractedMinor, 0n);
  let running = 0n;
  return lines.map((l, index) => {
    const isLast = index === lines.length - 1;
    const share = isLast
      ? baseAmountMinor - running
      : contractedTotal === 0n
        ? 0n
        : (baseAmountMinor * l.contractedMinor) / contractedTotal;
    running += share;
    return {
      clientServiceId: l.clientServiceId,
      name: l.name,
      amountMinor: share,
      // Only when the two differ — on a peso cobro they are the same number and
      // storing it twice invites the reader to think one of them means something else.
      originalAmountMinor: converted ? l.contractedMinor : null,
      sortOrder: l.sortOrder,
    };
  });
}

function toExchangeRateDto(r: {
  period: Date;
  arsPerUsdMinor: bigint;
  updatedAt: Date;
}): ExchangeRateDto {
  return {
    period: r.period.toISOString().slice(0, 10),
    arsPerUsdMinor: r.arsPerUsdMinor.toString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * The line breakdown of a generated cobro: the retainer part, then one line per production.
 *
 * With priced monthly lines the retainer is those lines. A client still on a hand-typed
 * fee has no line for it, which is fine on its own (a cobro with no lines is one amount) —
 * but once productions add lines, the retainer MUST get one too, or the lines would not
 * sum to the base and `create` refuses the cobro. It is the only line with no service.
 */
function lineDrafts(
  service: string,
  retainerMinor: bigint,
  monthlyLines: { id: string; name: string; priceMinor: bigint }[],
  productions: {
    clientServiceId: string | null;
    title: string;
    billAmountMinor: bigint | null;
    clientService: { name: string } | null;
  }[],
): ReceivableLineDraft[] {
  const drafts: ReceivableLineDraft[] = monthlyLines.map((l) => ({
    clientServiceId: l.id,
    name: l.name,
    contractedMinor: l.priceMinor,
    sortOrder: 0,
  }));
  if (monthlyLines.length === 0 && retainerMinor > 0n && productions.length > 0) {
    drafts.push({ clientServiceId: null, name: service, contractedMinor: retainerMinor, sortOrder: 0 });
  }
  for (const p of productions) {
    drafts.push({
      clientServiceId: p.clientServiceId,
      name: `${p.clientService?.name ?? 'Producción'} · ${p.title}`,
      contractedMinor: p.billAmountMinor!,
      sortOrder: 0,
    });
  }
  return drafts.map((d, index) => ({ ...d, sortOrder: index }));
}

/**
 * An amount for a refusal message, the way the operator reads money: es-AR grouping, the
 * lane's symbol, centavos only when there are any. BigInt end to end — a `Number` detour
 * would round a large peso figure before the operator ever saw it.
 */
function formatContractMinor(amountMinor: bigint, currency: string): string {
  const whole = (amountMinor / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cents = amountMinor % 100n;
  const symbol = currency === 'USD' ? 'US$' : '$';
  return cents === 0n ? `${symbol} ${whole}` : `${symbol} ${whole},${cents.toString().padStart(2, '0')}`;
}

function deriveTotal(base: bigint, extra: bigint, discount: bigint): bigint {
  const total = base + extra - discount;
  if (total < 0n) {
    throw new BadRequestError('Total cannot be negative (discount exceeds base + extra)');
  }
  return total;
}

function statusFor(collected: bigint, total: bigint): CollectionStatus {
  if (collected >= total && total > 0n) return 'collected';
  if (collected > 0n) return 'partial';
  return 'pending';
}

/** The first of the month a date falls in, read in UTC (the calendar `@db.Date` uses). */
function monthStartOf(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthBoundsOf(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

function yearBoundsOf(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 1));
  return { start, end };
}

export const billingService = {
  async list(
    tx: Prisma.TransactionClient,
    query: ListReceivablesQuery,
  ): Promise<PaginatedReceivablesDto> {
    const where: Prisma.ReceivableWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.billingStatus ? { billingStatus: query.billingStatus } : {}),
      ...(query.period
        ? (() => {
            const { start, end } = monthBoundsOf(query.period);
            return { period: { gte: start, lt: end } };
          })()
        : {}),
    };
    const { items, total } = await billingRepo.list(tx, where, query.limit, query.offset);
    return { items: items.map(toReceivableDto), total, limit: query.limit, offset: query.offset };
  },

  async getById(tx: Prisma.TransactionClient, id: string): Promise<ReceivableDto> {
    const r = await billingRepo.findById(tx, id);
    if (!r) {
      throw new NotFoundError(`Receivable ${id} not found`);
    }
    return toReceivableDto(r);
  },

  async create(
    tx: Prisma.TransactionClient,
    input: CreateReceivableInput,
    /** How the row came to exist. The month generator passes 'monthly_fee' so its own
     *  rows carry the mark the partial unique index constrains; everything else is a
     *  cobro somebody typed. Routed through this one method on purpose — the generator
     *  must derive its total and append its ledger charge exactly as a hand-made cobro
     *  does, and a second creation path is how those two drift apart. */
    source: 'manual' | 'monthly_fee' | 'one_time' = 'manual',
    /**
     * The client, when the caller already has it from the SAME transaction.
     *
     * The lookup below is two things at once: the existence check (`deletedAt: null`
     * rejects a dead client) and the source of the fiscal fields the DTO reports. The month
     * generator has already done exactly that read for the whole roster inside this
     * transaction, filtered to active clients -- so repeating it per client bought no
     * guarantee at all, only a round trip.
     *
     * Passing the record therefore MOVES the existence check to the caller's read rather than
     * removing it, and a caller that cannot make that claim about its own read must not
     * use this argument.
     */
    preloadedClient?: ReceivableClientFields & { id: string },
    /**
     * Where the amount came from, when the retainer is priced in one currency and billed
     * in another. Recorded on the row so the cobro can say "USD 500 at 1.234,50" for as
     * long as it exists, including after the next month's rate replaces this one.
     *
     * Only the generator and the one-time service charge pass it, and only from a rate
     * read in this transaction.
     */
    fx?: FxStamp,
    /**
     * The priced services this cobro is made of, in the CONTRACT's currency.
     *
     * Only the generator and the one-time service charge pass these; a hand-made cobro
     * is a single amount under a single label and stays that way. They are converted here rather than by the
     * caller because `convertToArsMinor` rounds half-up PER CALL, so converting the sum
     * is not the same as summing the conversions — the lines are made to add up to the
     * base by giving the remainder to the last one, and doing that anywhere else would
     * leave a cobro whose parts do not equal its whole.
     */
    lines?: ReceivableLineDraft[],
  ): Promise<ReceivableDto> {
    // The one thing the caller cannot vouch for from outside: that the record it handed
    // over is the client being billed. Getting that wrong files a cobro under someone
    // else's name with every query succeeding, so it is checked rather than trusted.
    if (preloadedClient && preloadedClient.id !== input.clientId) {
      throw new Error('preloadedClient is a different client from input.clientId');
    }
    const client =
      preloadedClient ??
      (await tx.client.findFirst({
        where: { id: input.clientId, deletedAt: null },
        select: { name: true, businessName: true, taxId: true, contactName: true },
      }));
    if (!client) {
      throw new BadRequestError('clientId does not reference a client in this workspace');
    }
    const base = input.baseAmountMinor;
    const extra = input.extraAmountMinor ?? 0n;
    const discount = input.discountAmountMinor ?? 0n;
    const total = deriveTotal(base, extra, discount);
    const created = await billingRepo.create(tx, {
      clientId: input.clientId,
      period: input.period,
      service: input.service,
      baseAmountMinor: base,
      extraAmountMinor: extra,
      discountAmountMinor: discount,
      totalAmountMinor: total,
      currency: input.currency,
      // Spread so a cobro billed in its own currency writes three NULLs rather than three
      // columns of `undefined`-shaped noise, and so the three can never be written apart.
      ...(fx
        ? {
            originalCurrency: fx.originalCurrency as CreateReceivableInput['currency'],
            originalAmountMinor: fx.originalAmountMinor,
            fxRateMinor: fx.fxRateMinor,
          }
        : {}),
      dueDate: input.dueDate,
      source,
    });
    // Ledger: a charge on the client's running account.
    await appendLedger(tx, {
      entityType: 'client',
      entityId: input.clientId,
      currency: created.currency,
      period: input.period,
      type: 'charge',
      debitMinor: total,
      description: `Cobro ${input.service}`,
      referenceType: 'receivable',
      referenceId: created.id,
    });
    if (lines && lines.length > 0) {
      const spread = spreadLines(lines, base, Boolean(fx));
      // The invariant, asserted rather than assumed: a cobro whose lines do not sum to
      // its base is a breakdown that contradicts its own total, and it would be read as
      // authoritative on the factura and in the statement sent to the client. Inside the
      // transaction, so a violation rolls the whole row back instead of persisting it.
      const linesTotal = spread.reduce((sum, l) => sum + l.amountMinor, 0n);
      if (linesTotal !== base) {
        throw new Error(`Receivable lines sum to ${linesTotal} but the base is ${base}`);
      }
      // ONE statement, never a loop: the generator already exceeded Prisma's 5 s
      // transaction budget in production, and a round trip per line per client would
      // multiply the count that put it there.
      await billingRepo.createLines(
        tx,
        spread.map((l) => ({ ...l, receivableId: created.id })),
      );
    }
    // Assembled rather than re-read. `emitter` and `treasuryAccount` are null because the
    // row was created without an emitterId or a treasuryAccountId one statement ago:
    // invoicing and collecting are separate, later actions. Asking the database to confirm
    // that was three round trips per row for an answer already known here.
    return toReceivableDto({ ...created, client, emitter: null, treasuryAccount: null });
  },

  /**
   * What the month generator WOULD create, with nothing written.
   *
   * A bulk money action must never be a blind click: the operator sees the roster, the
   * amount each client would be billed, and — named, not silently dropped — every client
   * this run is going to skip and why.
   */
  async monthlyFeePreview(tx: Prisma.TransactionClient, period: Date): Promise<MonthlyFeePreviewDto> {
    const month = monthStartOf(period);
    const { start, end } = monthBoundsOf(month);
    const productions = await billingRepo.listBillableProductions(tx, end);
    const withProductions = [...new Set(productions.map((p) => p.clientId!))];
    const [clients, existing, withoutFee, rate] = await Promise.all([
      billingRepo.listMonthlyFeeClients(tx, withProductions),
      billingRepo.listPeriodReceivables(tx, start, end),
      billingRepo.listActiveClientsWithoutFee(tx, withProductions),
      // Read once for the whole roster, alongside the other three. A lookup per candidate
      // would be a round trip per client for a value that cannot change mid-transaction.
      billingRepo.findExchangeRate(tx, month),
    ]);
    const items: MonthlyFeeCandidateDto[] = clients.map((client) => {
      // Only ONE contracted service can be resolved without asking. With several, the
      // operator picks: guessing here would put the whole retainer under whichever
      // service happened to be first in an array nobody ordered deliberately.
      const suggestedService = client.services.length === 1 ? (client.services[0] as string) : null;
      const generated = existing.find((r) => r.clientId === client.id && r.source === 'monthly_fee');
      // A client billed for productions alone has no retainer, so a hand-made cobro under
      // its service is not a duplicate of anything this run would write — the generator
      // runs no manual-clash check for it either, and the two must agree.
      const manual =
        suggestedService === null || client.monthlyFeeMinor === 0n
          ? undefined
          : existing.find(
              (r) =>
                r.clientId === client.id && r.source !== 'monthly_fee' && r.service === suggestedService,
            );
      const covering = generated ?? manual;
      // Every service this client was ALREADY billed by hand this period.
      //
      // `manual` above can only see this when exactly one service resolves, so a client
      // with none or several on record previews as clean no matter how many hand-made
      // cobros it already carries. Reported rather than skipped: a second cobro under a
      // genuinely different service is legitimate, so this informs the operator instead of
      // deciding for them. It is NOT the duplicate guard — `generateMonthlyFees` below
      // refuses a same-service clash whatever the browser sends. What it buys the dialog
      // is not queueing a row the run would skip, and not promising a cobro it cannot make.
      // Deduplicated: two hand-made cobros for the same service are a real and legitimate
      // thing, but rendering them as "Redes, Redes" reads as a bug in the list.
      const manualServices = [
        ...new Set(
          existing
            .filter((r) => r.clientId === client.id && r.source !== 'monthly_fee')
            .map((r) => r.service),
        ),
      ];
      // What this client would actually be billed. `null` means the retainer is in a
      // foreign currency and this month has no rate, which is a skip of its own: billing
      // it in dollars would settle into the account's USD lane, and the money arrives in
      // pesos. Ranked BELOW the two duplicate guards — a client already covered is not
      // waiting on a rate, and saying so is more useful than sending the operator to load
      // one that would change nothing.
      const priced = priceFor(client.monthlyFeeMinor, client.currency, rate);
      const skipReason: MonthlyFeeSkipReason | null = generated
        ? 'already_generated'
        : manual
          ? 'manual_exists'
          : priced === null
            ? 'missing_exchange_rate'
            : null;
      return {
        clientId: client.id,
        clientName: client.name,
        services: client.services,
        suggestedService,
        monthlyFeeMinor: client.monthlyFeeMinor.toString(),
        currency: client.currency,
        convertedArsMinor: priced?.fx ? priced.baseAmountMinor.toString() : null,
        discountPercentBp: client.discountPercentBp,
        // Resolved here, from the same helper the generator uses, so the dialog cannot
        // show a net figure the write would disagree with. Null when there is nothing to
        // price against — the operator is looking at a skip, not at a discount of zero.
        discountAmountMinor: priced
          ? discountFor(priced.baseAmountMinor, client.discountPercentBp).toString()
          : null,
        // The priced contract lines. Empty for a client on a hand-typed fee, which is
        // most of the book — the dialog keys on the FIELD being present, not on the
        // array being non-empty, so an old API (which sends neither) falls back to
        // billing the whole retainer instead of offering a checklist it cannot honour.
        lines: client.serviceLines.map((l) => ({
          id: l.id,
          name: l.name,
          priceMinor: l.priceMinor.toString(),
        })),
        productions: productions
          .filter((p) => p.clientId === client.id)
          .map((p) => ({
            id: p.id,
            date: p.date.toISOString().slice(0, 10),
            title: p.title,
            serviceName: p.clientService?.name ?? '',
            amountMinor: p.billAmountMinor!.toString(),
          })),
        skipReason,
        existingReceivableId: covering?.id ?? null,
        manualServices,
      };
    });
    return {
      period: month.toISOString().slice(0, 10),
      items,
      withoutFee: withoutFee.map((client) => client.name),
      exchangeRate: rate ? toExchangeRateDto(rate) : null,
    };
  },

  /**
   * Set the month's dollar rate.
   *
   * The period is normalized to the first of its month, so a rate loaded on the 3rd and
   * one loaded on the 15th are the same month's rate and the second replaces the first.
   * Without that they would be two rows, and which one the generator picked would depend
   * on the day somebody happened to open the dialog.
   *
   * Replacing a rate does NOT reprice anything already generated under the old one: those
   * cobros carry their own stamp (see `Receivable.fxRateMinor`). Correcting one that was
   * billed at a wrong rate is an amount edit, which leaves a visible trail.
   */
  async setExchangeRate(
    tx: Prisma.TransactionClient,
    input: SetExchangeRateInput,
  ): Promise<ExchangeRateDto> {
    const rate = await billingRepo.upsertExchangeRate(
      tx,
      monthStartOf(input.period),
      input.arsPerUsdMinor,
    );
    return toExchangeRateDto(rate);
  },

  /**
   * Turn the month's retainers into cobros, one per client.
   *
   * Idempotent by construction: every client already carrying a generated cobro for the
   * period is skipped, and the partial unique index from migration 0018 is the backstop
   * under a race. It re-reads `monthlyFeeMinor` inside the transaction rather than
   * trusting the amount the browser previewed, and it creates through `create` so the
   * derived total and the cuenta-corriente charge are identical to a hand-made cobro.
   *
   * The period is normalized to the first of its month. Without that, two runs naming
   * the same month by different days ('2026-08-01' and '2026-08-15') are two different
   * keys, and the index that makes this safe would never see them collide.
   */
  async generateMonthlyFees(
    tx: Prisma.TransactionClient,
    input: GenerateMonthlyFeesInput,
  ): Promise<MonthlyFeeGenerationDto> {
    const month = monthStartOf(input.period);
    const { start, end } = monthBoundsOf(month);
    const productions = await billingRepo.listBillableProductions(
      tx,
      end,
      input.items.map((item) => item.clientId),
    );
    const [clients, existing, names, rate] = await Promise.all([
      billingRepo.listMonthlyFeeClients(tx, [...new Set(productions.map((p) => p.clientId!))]),
      billingRepo.listPeriodReceivables(tx, start, end),
      billingRepo.listClientNames(tx, input.items.map((item) => item.clientId)),
      // One read for the whole batch. Inside the loop this would be a round trip per
      // client, and this endpoint has already been over its transaction budget once.
      billingRepo.findExchangeRate(tx, month),
    ]);
    const billable = new Map(clients.map((client) => [client.id, client]));
    const nameOf = new Map(names.map((client) => [client.id, client.name]));
    // Mutable copy: a row created inside this loop must be visible to the rows after it,
    // or the same clientId sent twice in one body would be billed twice.
    const covered = existing.map((r) => ({ clientId: r.clientId, service: r.service, source: r.source }));

    const created: ReceivableDto[] = [];
    const skipped: MonthlyFeeGenerationDto['skipped'] = [];
    const skip = (clientId: string, reason: MonthlyFeeSkipReason) => {
      skipped.push({ clientId, clientName: nameOf.get(clientId) ?? 'Cliente', reason });
    };

    for (const item of input.items) {
      const client = billable.get(item.clientId);
      // Not billable ANY MORE: the preview said otherwise, and between then and now the
      // client was paused, churned, deleted, or had its fee zeroed. Reported, not hidden.
      if (!client) {
        skip(item.clientId, 'not_billable');
        continue;
      }
      if (covered.some((r) => r.clientId === client.id && r.source === 'monthly_fee')) {
        skip(item.clientId, 'already_generated');
        continue;
      }
      // The lines this run will bill: the operator's selection, INTERSECTED with the
      // client's own live lines. Never trusted as sent — an id belonging to another
      // client, or to a line deleted since the preview, is dropped here rather than
      // priced. No selection means the whole contract, which is also what an older
      // browser sends.
      const selectedLines =
        item.clientServiceIds === undefined
          ? client.serviceLines
          : client.serviceLines.filter((l) => item.clientServiceIds!.includes(l.id));

      // The productions this run will bill: the operator's selection INTERSECTED with the
      // client's own pending ones, re-read here. Absent means none (see the schema): an
      // older browser never showed them, so it must not bill them.
      const selectedProductions = productions.filter(
        (p) => p.clientId === client.id && (item.productionIds ?? []).includes(p.id),
      );
      const productionsMinor = selectedProductions.reduce((sum, p) => sum + p.billAmountMinor!, 0n);

      // The retainer part. With priced monthly lines it is the SELECTED ones (an explicit
      // empty selection is a month billed for productions only). With no monthly line it
      // is the hand-typed fee — which is 0 for a client priced by productions alone, and
      // the real abono for a client that was never priced.
      const retainerMinor =
        selectedLines.length > 0
          ? selectedLines.reduce((sum, l) => sum + l.priceMinor, 0n)
          : client.serviceLines.length > 0
            ? 0n
            : client.monthlyFeeMinor;

      // Every service name the RETAINER part will carry: the line names when there are
      // lines, otherwise the single service label. The guard has to compare against the
      // SET, because a multi-line cobro's `service` column is a summary label — comparing
      // that one string against a hand-made cobro for 'Redes' never matches, the
      // idempotency index only sees `source = 'monthly_fee'`, and the client is billed
      // twice while the toast truthfully reports the count it created.
      //
      // No retainer, no check: productions carry their own once-only marker
      // (`receivableId`), and a hand-made cobro is not a copy of them.
      const billedNames =
        selectedLines.length > 0 ? selectedLines.map((l) => l.name) : [item.service];
      if (
        retainerMinor > 0n &&
        covered.some(
          (r) =>
            r.clientId === client.id && r.source !== 'monthly_fee' && billedNames.includes(r.service),
        )
      ) {
        skip(item.clientId, 'manual_exists');
        continue;
      }
      // Nothing to bill is not a free cobro: every id the browser sent has gone (deleted,
      // deactivated or billed since the preview), or the selection sums to nothing. The
      // row is reported rather than written at $0 with a $0 charge on the client's account.
      if (retainerMinor + productionsMinor === 0n) {
        skip(item.clientId, 'not_billable');
        continue;
      }
      // Re-read from the client inside the transaction and priced HERE, never taken from
      // the request: the browser previewed an amount, it does not get to bill one. The
      // same `priceFor` the preview used, so what the operator approved is what is written.
      const contractedMinor = retainerMinor + productionsMinor;
      const priced = priceFor(contractedMinor, client.currency, rate);
      // A dollar client with no rate for the month. The preview marks these unselectable,
      // so reaching here means the roster changed underneath or the request was assembled
      // elsewhere. Skipped rather than billed in dollars, and reported by name.
      if (priced === null) {
        skip(item.clientId, 'missing_exchange_rate');
        continue;
      }
      const dto = await this.create(
        tx,
        {
          clientId: client.id,
          period: month,
          service: item.service,
          baseAmountMinor: minor(priced.baseAmountMinor),

          // The client's standing rate, resolved to centavos against the converted base.
          // `create` derives the total from it, so the discount is subtracted exactly
          // once and the row records the amount rather than the rule.
          discountAmountMinor: minor(discountFor(priced.baseAmountMinor, client.discountPercentBp)),
          currency: priced.currency as CreateReceivableInput['currency'],
          dueDate: input.dueDate,
        },
        'monthly_fee',
        // Already read, in this transaction. See `create`.
        client,
        priced.fx ?? undefined,
        // The itemization, so a year from now the cobro can still explain itself — and
        // so a month where a service was deliberately left out is visible rather than
        // being a total nobody can reconstruct. Contract amounts: `create` converts
        // them alongside the base.
        lineDrafts(item.service, retainerMinor, selectedLines, selectedProductions),
      );
      if (selectedProductions.length > 0) {
        // Claimed in the same transaction as the cobro. A shortfall means another run
        // billed one of them in between: abort rather than bill it twice.
        const linked = await billingRepo.linkProductions(
          tx,
          selectedProductions.map((p) => ({ id: p.id, version: p.version })),
          dto.id,
        );
        if (linked !== selectedProductions.length) {
          throw new ConflictError(
            'Una producción cambió o ya se cobró mientras generabas. Volvé a abrir la vista previa.',
          );
        }
      }
      created.push(dto);
      covered.push({ clientId: client.id, service: item.service, source: 'monthly_fee' });
    }

    return { period: month.toISOString().slice(0, 10), created, skipped };
  },

  /**
   * Bill part of a ONE-TIME service line: "le hemos cobrado el 50% de anticipo de la
   * Etapa 1". Repeatable until the line's price is used up.
   *
   * Everything that decides money is read here, inside the transaction: the line (live,
   * active, one_time), the client (currency, standing
   * discount), what was already billed against the line, and the month's rate. The
   * request contributes an amount the server checks and a date — never a price.
   *
   * Priced by the same `priceFor` / `discountFor` the month generator uses, and created
   * through `create`, so the total, the ledger charge and the line breakdown are the
   * ones a retainer cobro gets. `source = 'one_time'` keeps it out of the generator's
   * (client, period) idempotency index: an anticipo and the month's retainer are two
   * different cobros of the same month by design.
   */
  async chargeServiceLine(
    tx: Prisma.TransactionClient,
    input: ServiceLineChargeInput,
  ): Promise<ReceivableDto> {
    // Serialise concurrent charges on this line before reading what it has billed.
    await billingRepo.lockServiceLine(tx, input.clientServiceId);
    const line = await billingRepo.findChargeableServiceLine(tx, input.clientServiceId);
    if (!line) {
      throw new NotFoundError(`Service line ${input.clientServiceId} not found`);
    }
    if (line.billingMode !== 'one_time') {
      throw new BadRequestError('Solo un servicio de única vez se cobra desde acá.');
    }
    if (!line.active) {
      throw new ConflictError('El servicio está inactivo.');
    }
    const amount: bigint = input.amountMinor;
    if (amount <= 0n) {
      throw new BadRequestError('El importe a cobrar tiene que ser mayor a cero.');
    }
    const billed = await billingRepo.billedAgainstServiceLine(tx, line.id);
    const remaining = line.priceMinor - billed;
    if (amount > remaining) {
      throw new ConflictError(
        remaining > 0n
          ? `El importe supera lo que falta cobrar de este servicio (${formatContractMinor(remaining, line.client.currency)}).`
          : 'Este servicio ya se cobró completo.',
      );
    }
    const month = monthStartOf(input.period);
    const rate = line.client.currency === 'USD' ? await billingRepo.findExchangeRate(tx, month) : null;
    const priced = priceFor(amount, line.client.currency, rate);
    if (priced === null) {
      throw new ConflictError(
        `Falta la cotización del dólar de ${month.toISOString().slice(0, 7)}. Cargala en Generar cobros del mes.`,
      );
    }
    return this.create(
      tx,
      {
        clientId: line.clientId,
        period: month,
        service: line.name,
        baseAmountMinor: minor(priced.baseAmountMinor),
        discountAmountMinor: minor(discountFor(priced.baseAmountMinor, line.client.discountPercentBp)),
        currency: priced.currency as CreateReceivableInput['currency'],
        dueDate: input.dueDate,
      },
      'one_time',
      undefined,
      priced.fx ?? undefined,
      [{ clientServiceId: line.id, name: line.name, contractedMinor: amount, sortOrder: 0 }],
    );
  },

  async update(
    tx: Prisma.TransactionClient,
    id: string,
    input: UpdateReceivableInput,
  ): Promise<ReceivableDto> {
    const current = await billingRepo.findById(tx, id);
    if (!current) {
      throw new NotFoundError(`Receivable ${id} not found`);
    }
    if (current.status === 'cancelled') {
      throw new ConflictError('Cannot edit a cancelled receivable');
    }
    // An itemized cobro's base is the sum of its lines. Letting it be edited freely
    // leaves a breakdown that contradicts the total it belongs to — and the breakdown
    // is what goes on the factura and into the statement sent to the client, so the
    // reader has no way to tell which of the two numbers is the real one.
    //
    // Refused rather than re-spread across the lines: silently changing what each
    // service cost, because someone corrected a total, invents prices nobody agreed.
    // Cancel and regenerate is the honest correction, and the partial index on
    // (client, period) already makes a re-run safe.
    // Only a CHANGED base: the edit dialog resends every amount on every save, and refusing
    // the unchanged one made an itemized cobro impossible to edit at all — its extras and
    // discount included, the very month changes the docs send operators to this dialog for.
    if (input.baseAmountMinor !== undefined && input.baseAmountMinor !== current.baseAmountMinor) {
      const lineCount = await billingRepo.countLines(tx, id);
      if (lineCount > 0) {
        throw new ConflictError(
          'Este cobro está desglosado por servicio. Anulalo y volvé a generarlo para cambiar el importe.',
        );
      }
    }
    const base = input.baseAmountMinor ?? current.baseAmountMinor;
    const extra = input.extraAmountMinor ?? current.extraAmountMinor;
    const discount = input.discountAmountMinor ?? current.discountAmountMinor;
    const total = deriveTotal(base, extra, discount);
    // A negative adjustment must not push the total below what's already been
    // collected (that would report a phantom over-collection / negative
    // outstanding, corrupting the reports). Mirrors payments.service.update.
    if (total < current.collectedAmountMinor) {
      throw new BadRequestError('Total cannot be below the amount already collected');
    }
    const status = statusFor(current.collectedAmountMinor, total);
    const updated = await billingRepo.update(tx, id, {
      ...(input.service !== undefined ? { service: input.service } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      baseAmountMinor: base,
      extraAmountMinor: extra,
      discountAmountMinor: discount,
      totalAmountMinor: total,
      status,
      // Monthly-plan fields (do not affect the total; effectiveDate null clears it).
      ...(input.reviewStatus !== undefined ? { reviewStatus: input.reviewStatus } : {}),
      ...(input.effectiveDate !== undefined ? { effectiveDate: input.effectiveDate } : {}),
      ...(input.planNotes !== undefined ? { planNotes: input.planNotes } : {}),
      ...(input.extras !== undefined
        ? { extras: input.extras as unknown as Prisma.InputJsonValue }
        : {}),
      // Costs the cobro carries. Deliberately NOT part of `total`: what the client is billed
      // and what the work cost the studio are different sides of the record — the total
      // stays base + extra − discount, and these only move the margin the reports derive.
      // (Design, communication and production are no longer accepted: team cost comes from
      // the assignments — see `updateReceivableSchema`.)
      ...(input.costPautaMinor !== undefined ? { costPautaMinor: input.costPautaMinor } : {}),
      ...(input.costFixedMinor !== undefined ? { costFixedMinor: input.costFixedMinor } : {}),
      version: { increment: 1 },
    });
    // Keep the client's running account in lock-step: post the total delta so the
    // ledger never drifts from the receivable (charge up / reverse down).
    const delta = total - current.totalAmountMinor;
    if (delta !== 0n) {
      await appendLedger(tx, {
        entityType: 'client',
        entityId: current.clientId,
        currency: current.currency,
        period: current.period,
        type: 'adjustment',
        ...(delta > 0n ? { debitMinor: delta } : { creditMinor: -delta }),
        description: `Ajuste ${input.service ?? current.service}`,
        referenceType: 'receivable',
        referenceId: id,
      });
    }
    return toReceivableDto(updated);
  },

  /** Atomic, idempotent collection. With an idempotencyKey, the key is recorded
   *  via INSERT … ON CONFLICT DO NOTHING; a replay returns false and we no-op,
   *  returning the already-applied state. The apply itself is a single guarded
   *  UPDATE (no TOCTOU, no oversell). */
  async collect(
    tx: Prisma.TransactionClient,
    id: string,
    amount: bigint,
    opts: {
      idempotencyKey?: string;
      collectedAt?: Date;
      /** WHERE the cash landed. When present the account's balance moves by exactly this
       *  amount, in this transaction. When absent nothing moves — which is the honest
       *  outcome for a collection whose destination nobody recorded. */
      treasuryAccountId?: string;
      userId?: string;
    } = {},
  ): Promise<ReceivableDto> {
    if (amount <= 0n) {
      throw new BadRequestError('Collection amount must be positive');
    }
    if (opts.idempotencyKey) {
      const fresh = await tryRecordIdempotencyKey(
        tx,
        `collect:${id}`,
        opts.idempotencyKey,
      );
      if (!fresh) {
        // A retry of an already-applied collection → idempotent no-op. The treasury
        // movement is inside the same guard, so a retry cannot double-credit a balance.
        return this.getById(tx, id);
      }
    }
    const affected = await billingRepo.collect(tx, id, amount, opts.collectedAt);
    if (affected === 0) {
      const exists = await billingRepo.findById(tx, id);
      if (!exists) {
        throw new NotFoundError(`Receivable ${id} not found`);
      }
      throw new ConflictError('Collection would exceed the receivable total, or it is cancelled');
    }
    const r = await billingRepo.findById(tx, id);
    if (r) {
      await appendLedger(tx, {
        entityType: 'client',
        entityId: r.clientId,
        currency: r.currency,
        period: r.period,
        type: 'collection',
        creditMinor: amount,
        description: 'Cobranza',
        referenceType: 'receivable',
        referenceId: r.id,
      });
      if (opts.treasuryAccountId) {
        // Move the balance FIRST: it is the step that validates the destination, and it
        // reports an unknown account as a 400. Connecting the relation first would fail
        // on the same input as a Prisma "required record not found" — a 404 about the
        // COBRO, which is both wrong and unactionable.
        await postTreasuryMovement(tx, {
          accountId: opts.treasuryAccountId,
          date: opts.collectedAt ?? new Date(),
          direction: 'inflow',
          currency: r.currency,
          amountMinor: amount,
          description: `Cobro ${r.client.name}`,
          referenceType: 'receivable',
          referenceId: r.id,
          ...(opts.userId ? { createdByUserId: opts.userId } : {}),
        });
        // Remembered on the row too, so the detail can say where the money landed without
        // joining the movement log. Latest wins, same contract as `collectedAt` — the
        // column answers "where was this last collected".
        await billingRepo.update(tx, id, {
          treasuryAccount: { connect: { id: opts.treasuryAccountId } },
        });
      }
    }
    return this.getById(tx, id);
  },

  /** Generate the comprobante: reserve emitter quota BEFORE issuing, allocate
   *  the monotonic sequence atomically, stamp a (synthetic) CAE. */
  async generateInvoice(
    tx: Prisma.TransactionClient,
    id: string,
    emitterId: string,
  ): Promise<ReceivableDto> {
    // Lock the receivable so two concurrent issuances on it serialize — the
    // second sees the first's committed invoice and is rejected (no orphaned
    // comprobante number).
    await billingRepo.lockReceivable(tx, id);
    const r = await billingRepo.findById(tx, id);
    if (!r) {
      throw new NotFoundError(`Receivable ${id} not found`);
    }
    if (r.status === 'cancelled') {
      throw new ConflictError('Cannot invoice a cancelled receivable');
    }
    if (r.invoiceNumber || r.billingStatus === 'invoiced') {
      throw new ConflictError('Receivable already invoiced');
    }
    const emitter = await billingRepo.findEmitter(tx, emitterId);
    if (!emitter) {
      throw new NotFoundError(`Invoice emitter ${emitterId} not found`);
    }

    // A capped emitter cannot issue a comprobante in a lane the cap is not written in.
    //
    // The two operands of the checks below are not comparable and never were.
    // `issuedMinorInWindow` filters to `currency: 'ARS'` on purpose — its own comment
    // spells out why, in these words: "Summing minor units across currencies would count a
    // USD 1.000 comprobante as 100.000 toward a peso cap, reporting roughly a thousandth of
    // the quota actually consumed and letting the emitter issue far past its legal limit.
    // That is a compliance failure, not a display bug, so it is guarded here rather than
    // left to the caller." It was then left to the caller: `r.totalAmountMinor` is added
    // raw, in whatever lane the row is in, one frame up.
    //
    // Because ARS-per-USD is always far greater than 1, the gate fails OPEN every time — a
    // USD 5.000 comprobante contributes 500.000 minor units to a cap it really consumes
    // ~318% of. And once issued, that row leaves the `WHERE` permanently, so it never
    // counts toward any later check either. Every surface that could warn reads the same
    // ARS-only sum and agrees with the bug.
    //
    // The fix is a REFUSAL rather than a conversion, because the conversion has no defined
    // rate: nothing records a cotización at issuance, and which rate applies on which day
    // is a fiscal question no code change settles. A refusal is correct under every
    // possible answer to it, and it can be relaxed the day the answer arrives. An
    // uncapped emitter is untouched — there is no limit to compare against.
    if (r.currency !== 'ARS' && (emitter.monthlyLimitMinor !== null || emitter.annualLimitMinor !== null)) {
      throw new ConflictError(
        `Cannot issue a ${r.currency} comprobante from an emitter with a peso quota: the amount cannot be counted against the cap`,
      );
    }

    // Lock the emitter so the quota check + sequence consumption are atomic
    // against concurrent issuers (reserve-before-effect, no TOCTOU on the cap).
    await billingRepo.lockEmitter(tx, emitterId);
    const now = new Date();
    if (emitter.monthlyLimitMinor !== null) {
      const { start, end } = monthBoundsOf(now);
      const issued = await billingRepo.issuedMinorInWindow(tx, emitterId, start, end);
      if (issued + r.totalAmountMinor > emitter.monthlyLimitMinor) {
        throw new ConflictError('Emitter monthly quota would be exceeded');
      }
    }
    if (emitter.annualLimitMinor !== null) {
      const { start, end } = yearBoundsOf(now);
      const issued = await billingRepo.issuedMinorInWindow(tx, emitterId, start, end);
      if (issued + r.totalAmountMinor > emitter.annualLimitMinor) {
        throw new ConflictError('Emitter annual quota would be exceeded');
      }
    }

    const seq = await billingRepo.consumeInvoiceNumber(tx, emitterId);
    if (!seq) {
      throw new NotFoundError(`Invoice emitter ${emitterId} not found`);
    }
    const invoiceNumber = `${String(seq.puntoDeVenta).padStart(5, '0')}-${String(seq.number).padStart(8, '0')}`;
    const cae = `7${String(seq.number).padStart(13, '0')}`; // synthetic until real ARCA

    const updated = await billingRepo.update(tx, id, {
      emitter: { connect: { id: emitterId } },
      invoiceNumber,
      cae,
      billingStatus: 'invoiced',
      invoiceIssuedAt: new Date(),
      version: { increment: 1 },
    });
    return toReceivableDto(updated);
  },

  async cancel(tx: Prisma.TransactionClient, id: string): Promise<ReceivableDto> {
    // Locked before the read: whether the productions go back depends on what was
    // collected, and a collection committing between an unlocked read and the update
    // would release — and later re-bill — work the client had already started paying.
    await billingRepo.lockReceivable(tx, id);
    // findById excludes soft-deleted rows, so a receivable already cancelled
    // reads as not-found here — a second cancel 404s and never double-reverses.
    const r = await billingRepo.findById(tx, id);
    if (!r) {
      throw new NotFoundError(`Receivable ${id} not found`);
    }
    const updated = await billingRepo.update(tx, id, {
      status: 'cancelled',
      deletedAt: new Date(),
      version: { increment: 1 },
    });
    // The productions this cobro billed are owed again: give them back so the next cobro
    // picks them up. Same transaction — a cancelled cobro holding its productions would
    // leave them billed on no live cobro, and never billed again.
    //
    // Except when money already came in on it. That part "was really received and stays"
    // (the reversal below leaves it charged), so releasing the productions would bill,
    // and collect, the same work twice. They stay on the cancelled cobro; the operator
    // settles the difference by hand.
    if (r.collectedAmountMinor === 0n) {
      await billingRepo.releaseProductions(tx, id);
    }
    // Reverse the still-outstanding charge on the client's account (the collected
    // part was really received and stays). Keeps the running balance correct.
    const outstanding = r.totalAmountMinor - r.collectedAmountMinor;
    if (outstanding > 0n) {
      await appendLedger(tx, {
        entityType: 'client',
        entityId: r.clientId,
        currency: r.currency,
        period: r.period,
        type: 'reversal',
        creditMinor: outstanding,
        description: 'Anulación de cobro',
        referenceType: 'receivable',
        referenceId: r.id,
      });
    }
    return toReceivableDto(updated);
  },

  /** Associate an EXTERNAL factura (emitted outside the system): record its number + date
   *  and mark the receivable `manual`. No sequence/CAE — that is the whole point of manual. */
  async associateInvoice(
    tx: Prisma.TransactionClient,
    id: string,
    input: { invoiceNumber: string; issuedAt: Date },
  ): Promise<ReceivableDto> {
    const r = await billingRepo.findById(tx, id);
    if (!r) {
      throw new NotFoundError(`Receivable ${id} not found`);
    }
    if (r.status === 'cancelled') {
      throw new ConflictError('Cannot invoice a cancelled receivable');
    }
    if (r.invoiceNumber || r.billingStatus === 'invoiced') {
      throw new ConflictError('Receivable already invoiced');
    }
    const updated = await billingRepo.update(tx, id, {
      invoiceNumber: input.invoiceNumber,
      invoiceIssuedAt: input.issuedAt,
      billingStatus: 'manual',
      version: { increment: 1 },
    });
    return toReceivableDto(updated);
  },

  /** Mark the factura / cuenta corriente as sent. A manually-associated invoice keeps its
   *  `manual` origin (overwriting to `sent` would erase that distinction); others advance. */
  async markInvoiceSent(
    tx: Prisma.TransactionClient,
    id: string,
    actorUserId: string,
  ): Promise<ReceivableDto> {
    const r = await billingRepo.findById(tx, id);
    if (!r) {
      throw new NotFoundError(`Receivable ${id} not found`);
    }
    const billingStatus = r.billingStatus === 'manual' ? 'manual' : 'sent';
    const updated = await billingRepo.update(tx, id, {
      billingStatus,
      version: { increment: 1 },
    });
    // `notify` owns its own failure boundary (see its doc). It cannot turn a DB failure
    // into a survivable one — nothing at that layer can — but it never propagates its own.
    await notificationsService.notify(tx, actorUserId, {
      type: 'statement.sent',
      title: `Estado de cuenta enviado: ${r.client.name}`,
      body: r.service,
      entityType: 'receivable',
      entityId: id,
    });
    return toReceivableDto(updated);
  },

  async kpis(tx: Prisma.TransactionClient, period?: Date): Promise<ReceivableKpisDto> {
    const where: Prisma.ReceivableWhereInput = {
      deletedAt: null,
      status: { not: 'cancelled' },
      ...(period
        ? (() => {
            const { start, end } = monthBoundsOf(period);
            return { period: { gte: start, lt: end } };
          })()
        : {}),
    };
    const { count, billed, collected } = await billingRepo.kpis(tx, where);
    return {
      count,
      totalBilledMinor: billed.toString(),
      totalCollectedMinor: collected.toString(),
      totalOutstandingMinor: (billed - collected).toString(),
    };
  },

  async listEmitters(tx: Prisma.TransactionClient): Promise<InvoiceEmitterDto[]> {
    const emitters = await billingRepo.listEmitters(tx);
    const { start, end } = monthBoundsOf(new Date());
    const dtos: InvoiceEmitterDto[] = [];
    for (const e of emitters) {
      const monthIssued = await billingRepo.issuedMinorInWindow(tx, e.id, start, end);
      dtos.push({
        id: e.id,
        code: e.code,
        label: e.label,
        cuit: e.cuit,
        puntoDeVenta: e.puntoDeVenta,
        connected: e.connected,
        monthlyLimitMinor: e.monthlyLimitMinor?.toString() ?? null,
        annualLimitMinor: e.annualLimitMinor?.toString() ?? null,
        monthIssuedMinor: monthIssued.toString(),
      });
    }
    return dtos;
  },
};
