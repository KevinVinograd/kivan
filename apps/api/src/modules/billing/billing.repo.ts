/**
 * Billing repository. Runs on the `tx` from runInTx. The money mutations are deliberately atomic:
 *   - `collect` is a single guarded UPDATE (no read-then-write TOCTOU): the
 *     WHERE clause enforces the non-oversell invariant atomically.
 *   - `consumeInvoiceNumber` atomically increments the emitter's monotonic
 *     comprobante sequence.
 */
import type { Prisma } from '@hold/db';

/**
 * Every receivable read/mutation returns with the client (name + fiscal/contact
 * fields the Cobros list searches on) and the emitter code joined in, so the DTO
 * carries `clientName` without a second round-trip. Applied uniformly to list,
 * findById, create and update so ALL service paths map a consistently-shaped row.
 */
const receivableInclude = {
  client: { select: { name: true, businessName: true, taxId: true, contactName: true } },
  emitter: { select: { code: true } },
  // Where a collection landed, joined for display. A cobro detail that shows the
  // destination must show its NAME, and a second round-trip per row to get it is how a
  // list of 100 becomes 101 queries.
  treasuryAccount: { select: { name: true } },
} satisfies Prisma.ReceivableInclude;

/**
 * The cobros that count against a one-time line's price: one-time charges that are live,
 * or that were cancelled AFTER money came in.
 *
 * Only `source = 'one_time'`: a line that was monthly before it became one-time carries
 * monthly cobros that were never part of this price, and counting them would read a
 * fresh project as already billed. And a cancelled cobro with a collection keeps
 * counting: the money was received and stays on the client's account, so giving the full
 * amount back under the cap would let the same anticipo be billed — and paid — twice.
 * Conservative on purpose: the whole cancelled amount counts, not only its collected part.
 */
const BILLED_ONE_TIME = {
  source: 'one_time',
  OR: [{ deletedAt: null }, { collectedAmountMinor: { gt: 0n } }],
} satisfies Prisma.ReceivableWhereInput;

export const billingRepo = {
  async list(tx: Prisma.TransactionClient, where: Prisma.ReceivableWhereInput, limit: number, offset: number) {
    const [items, total] = await Promise.all([
      tx.receivable.findMany({
        where,
        include: receivableInclude,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      tx.receivable.count({ where }),
    ]);
    return { items, total };
  },

  findById(tx: Prisma.TransactionClient, id: string) {
    return tx.receivable.findFirst({ where: { id, deletedAt: null }, include: receivableInclude });
  },

  /** Take a row lock so concurrent issuance on the same receivable serializes. */
  async lockReceivable(tx: Prisma.TransactionClient, id: string): Promise<void> {
    await tx.$executeRaw`SELECT 1 FROM "Receivable" WHERE "id" = ${id}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
  },

  /** Take a row lock so concurrent quota+sequence on the same emitter serializes. */
  async lockEmitter(tx: Prisma.TransactionClient, id: string): Promise<void> {
    await tx.$executeRaw`SELECT 1 FROM "InvoiceEmitter" WHERE "id" = ${id}::uuid FOR UPDATE`;
  },

  /**
   * Deliberately WITHOUT `receivableInclude`.
   *
   * The include cost four extra round trips per row: Prisma re-reads the row it just
   * inserted, then fetches the client, the emitter and the treasury account separately. On
   * a row created one statement earlier, `emitterId` and `treasuryAccountId` are
   * structurally null -- invoicing and collecting are later, separate actions -- so two of
   * those queries could only ever return nothing, and the caller already holds the client.
   * The DTO is assembled from what is in hand instead (see billing.service.create).
   *
   * That is nine round trips per client down to four in the month generator, which is what
   * put a full roster inside the transaction budget rather than over it.
   */
  create(
    tx: Prisma.TransactionClient,
    /**
     * The two ids are omitted rather than merely unused: the caller reports `emitterCode`
     * and `treasuryAccountName` as null WITHOUT asking the database, and that is only
     * sound while a created row cannot carry either. A future caller that wants to set one
     * now fails to compile instead of silently returning a cobro whose emitter is on the
     * row but missing from the DTO.
     */
    data: Omit<Prisma.ReceivableUncheckedCreateInput, 'emitterId' | 'treasuryAccountId'>,
  ) {
    return tx.receivable.create({ data });
  },

  update(tx: Prisma.TransactionClient, id: string, data: Prisma.ReceivableUpdateInput) {
    return tx.receivable.update({ where: { id }, data, include: receivableInclude });
  },

  /**
   * ATOMIC collect (no TOCTOU). One guarded UPDATE: it applies `amount` and
   * recomputes the collection status ONLY if the row exists, isn't cancelled,
   * and the new collected total would not exceed the receivable total. Returns
   * the number of rows updated (1 = applied, 0 = not found / would-oversell).
   */
  async collect(
    tx: Prisma.TransactionClient,
    id: string,
    amount: bigint,
    /**
     * When the cash actually arrived. Defaults to now. On a partial collection the
     * latest one wins, which is the documented contract of the column: it answers
     * "when was this last collected", not "when was each instalment".
     */
    collectedAt: Date = new Date(),
  ): Promise<number> {
    return tx.$executeRaw`
      UPDATE "Receivable"
      SET "collectedAmountMinor" = "collectedAmountMinor" + ${amount},
          "status" = CASE
            WHEN "collectedAmountMinor" + ${amount} >= "totalAmountMinor" THEN 'collected'::"CollectionStatus"
            WHEN "collectedAmountMinor" + ${amount} > 0 THEN 'partial'::"CollectionStatus"
            ELSE 'pending'::"CollectionStatus"
          END,
          "collectedAt" = ${collectedAt},
          "version" = "version" + 1,
          "updatedAt" = now()
      WHERE "id" = ${id}::uuid
        AND "deletedAt" IS NULL
        AND "status" <> 'cancelled'::"CollectionStatus"
        AND ${amount} > 0
        AND "collectedAmountMinor" + ${amount} <= "totalAmountMinor"`;
  },

  /**
   * The clients the month generator would bill: active, live, and carrying a retainer.
   *
   * `status = 'active'` on purpose — `onboarding` has not started paying, `paused` has
   * stopped, and `churned` is gone. A fee of zero means the client is not on a retainer
   * at all, so it is not a candidate the operator should have to untick every month.
   */
  /** How many priced-service lines a cobro carries. Guards the edit path. */
  countLines(tx: Prisma.TransactionClient, receivableId: string) {
    return tx.receivableLine.count({ where: { receivableId } });
  },

  /** The cobro's itemization, in ONE statement — see the note at the call site. */
  createLines(tx: Prisma.TransactionClient, data: Prisma.ReceivableLineCreateManyInput[]) {
    return tx.receivableLine.createMany({ data });
  },

  /**
   * The clients the month generator can bill: a retainer (`monthlyFeeMinor > 0`), OR
   * productions waiting to be billed (`withProductions`, from `listBillableProductions`).
   * A client priced by productions alone has a fee of 0 and would otherwise never be
   * offered — its productions would wait forever. Required, never defaulted: a caller
   * that forgets it silently drops every production-only client.
   */
  listMonthlyFeeClients(tx: Prisma.TransactionClient, withProductions: string[]) {
    return tx.client.findMany({
      where: {
        deletedAt: null,
        status: 'active',
        OR: [{ monthlyFeeMinor: { gt: 0n } }, { id: { in: withProductions } }],
      },
      // The fiscal fields are here so the generator never has to read a client twice. It
      // holds every candidate already; re-reading each one inside the loop was a round trip
      // per client bought for four columns this single query returns for free. They are
      // what `toReceivableDto` reports, so narrowing this select silently empties the
      // columns the Cobros list searches on.
      select: {
        id: true,
        name: true,
        businessName: true,
        taxId: true,
        contactName: true,
        services: true,
        monthlyFeeMinor: true,
        // The client's standing discount rate. Narrowing it out of this select does not
        // fail — it prices every cobro at the full fee, silently, which is the worst
        // shape a billing bug can take.
        discountPercentBp: true,
        currency: true,
        // The priced contract lines. Same hazard as `discountPercentBp` above and then
        // some: without them the generator has no itemization to bill or to record, so
        // a client the operator carefully priced would be billed one undifferentiated
        // retainer — the correct total, with the breakdown silently discarded.
        //
        // Only LIVE, ACTIVE lines: a soft-deleted one is a service that left the
        // contract, and an inactive one is a service the studio stopped selling them.
        // Ordered so the cobro's lines come out in the order the operator arranged.
        //
        // And only MONTHLY ones: a one-time project price is billed in parts through the
        // service-line charge, and a per-production price through the productions linked
        // to it. Offering either here would bill a whole project, or a unit price with no
        // production behind it, every month.
        serviceLines: {
          where: { deletedAt: null, active: true, billingMode: 'monthly' },
          select: { id: true, name: true, priceMinor: true, sortOrder: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Productions waiting to be billed, up to the END of the given month: linked to a
   * per-production service line, marked billable, with an amount, and not on any cobro.
   *
   * "Up to" and not "in": a production logged after its month's cobro was generated must
   * reach the NEXT cobro instead of being stranded in a month nobody will generate again.
   * `receivableId IS NULL` is what makes a production billable exactly once.
   */
  listBillableProductions(tx: Prisma.TransactionClient, before: Date, clientIds?: string[]) {
    return tx.production.findMany({
      where: {
        deletedAt: null,
        receivableId: null,
        clientServiceId: { not: null },
        clientId: clientIds ? { in: clientIds } : { not: null },
        billable: { in: ['billable', 'both'] },
        billAmountMinor: { gt: 0n },
        period: { lt: before },
        // Only what the communication lead approved ("se hizo") is billed to the client.
        status: 'approved',
      },
      select: {
        id: true,
        clientId: true,
        clientServiceId: true,
        date: true,
        title: true,
        billAmountMinor: true,
        version: true,
        clientService: { select: { name: true } },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
  },

  /**
   * Mark productions as billed by one cobro. Guarded on `receivableId IS NULL`, so two
   * concurrent runs cannot both claim the same production: the caller compares the count
   * to what it meant to link and aborts the transaction on a shortfall.
   */
  async linkProductions(
    tx: Prisma.TransactionClient,
    productions: { id: string; version: number }[],
    receivableId: string,
  ) {
    // Keyed on the VERSION that was read and priced, not just the id: an amount edited
    // between that read and this write would otherwise be billed at the old figure while
    // the production is locked showing the new one.
    const r = await tx.production.updateMany({
      where: {
        OR: productions.map((p) => ({ id: p.id, version: p.version })),
        receivableId: null,
        deletedAt: null,
      },
      data: { receivableId, status: 'invoiced', version: { increment: 1 } },
    });
    return r.count;
  },

  /**
   * Give a cancelled cobro's productions back, so the next cobro can bill them. The caller
   * only does this for a cobro nothing was collected on (see `cancel`).
   */
  releaseProductions(tx: Prisma.TransactionClient, receivableId: string) {
    return tx.production.updateMany({
      where: { receivableId },
      // Back to APPROVED, not pending: it was approved before it was billed, and the
      // approval is what lets the next cobro bill it again.
      data: { receivableId: null, status: 'approved', version: { increment: 1 } },
    });
  },

  /**
   * Take a row lock on one service line for the rest of the transaction.
   *
   * The one-time cap is read-then-write: read what was billed, compare, create. Two charges
   * at once (a double click, two operators) would both read the same remainder and bill
   * the line past its price. Serialising on the line makes the second one read the first.
   */
  async lockServiceLine(tx: Prisma.TransactionClient, id: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "ClientService" WHERE id = ${id}::uuid FOR UPDATE`;
  },

  /**
   * A live service line with the client fields a one-time charge prices against.
   *
   * `client.deletedAt: null` refuses to bill
   * a removed client through a line it left behind.
   */
  findChargeableServiceLine(tx: Prisma.TransactionClient, id: string) {
    return tx.clientService.findFirst({
      where: { id, deletedAt: null, client: { deletedAt: null } },
      select: {
        id: true,
        clientId: true,
        name: true,
        priceMinor: true,
        active: true,
        billingMode: true,
        client: { select: { currency: true, discountPercentBp: true } },
      },
    });
  },

  /**
   * What has already been billed against one line, in the CONTRACT's currency: the
   * contracted figure (`originalAmountMinor`) when the cobro was converted, the amount
   * otherwise. Cancelled cobros are soft-deleted and give their share back.
   */
  async billedAgainstServiceLine(tx: Prisma.TransactionClient, clientServiceId: string) {
    const rows = await tx.receivableLine.findMany({
      where: { clientServiceId, receivable: BILLED_ONE_TIME },
      select: { amountMinor: true, originalAmountMinor: true },
    });
    return rows.reduce((sum, r) => sum + (r.originalAmountMinor ?? r.amountMinor), 0n);
  },

  /**
   * The active clients the generator cannot offer at all, because they carry no fee.
   *
   * They never enter `items`, so the dialog's skip machinery cannot reach them, and an
   * operator comparing a roster of 21 against 29 active clients had no way to tell a
   * correctly-excluded project-only client from a retainer nobody ever loaded. Named
   * here so the preview can say so out loud.
   */
  listActiveClientsWithoutFee(tx: Prisma.TransactionClient, withProductions: string[]) {
    return tx.client.findMany({
      // A fee-less client with productions to bill IS offered, so it is not "without fee"
      // in the sense this list reports.
      where: {
        deletedAt: null,
        status: 'active',
        monthlyFeeMinor: { lte: 0n },
        id: { notIn: withProductions },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  },

  /**
   * This month's dollar rate, or null.
   *
   * ONE read per request, never one per client. The generator loops over the roster and a
   * lookup inside that loop would be a round trip per row for a value that cannot change
   * mid-transaction — which is exactly the shape that put this endpoint over its
   * transaction budget in production.
   */
  findExchangeRate(tx: Prisma.TransactionClient, period: Date) {
    return tx.monthlyExchangeRate.findFirst({ where: { period } });
  },

  /**
   * Set the month's rate, creating it or replacing it.
   *
   * The unique index on `period` is what makes the second call an update rather than a duplicate.
   */
  upsertExchangeRate(
    tx: Prisma.TransactionClient,
    period: Date,
    arsPerUsdMinor: bigint,
  ) {
    return tx.monthlyExchangeRate.upsert({
      where: { period },
      create: { period, arsPerUsdMinor },
      update: { arsPerUsdMinor },
    });
  },

  /** Names for the ids a generation request named, billable or not, so a skipped client
   *  can be reported by name instead of by uuid. */
  listClientNames(tx: Prisma.TransactionClient, ids: string[]) {
    return tx.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  },

  /**
   * The live receivables of one month, reduced to what the generator needs to decide
   * whether a client is already covered. Read once per run rather than per client: a
   * roster of 60 would otherwise be 60 round-trips inside one transaction.
   */
  listPeriodReceivables(tx: Prisma.TransactionClient, start: Date, end: Date) {
    return tx.receivable.findMany({
      where: { period: { gte: start, lt: end }, deletedAt: null, status: { not: 'cancelled' } },
      select: { id: true, clientId: true, service: true, source: true },
    });
  },

  /** Atomically consume the next comprobante number for an emitter. */
  async consumeInvoiceNumber(tx: Prisma.TransactionClient, emitterId: string) {
    const rows = await tx.$queryRaw<{ number: number; puntoDeVenta: number }[]>`
      UPDATE "InvoiceEmitter"
      SET "nextNumber" = "nextNumber" + 1
      WHERE "id" = ${emitterId}::uuid
      RETURNING ("nextNumber" - 1) AS "number", "puntoDeVenta" AS "puntoDeVenta"`;
    return rows[0];
  },

  findEmitter(tx: Prisma.TransactionClient, id: string) {
    return tx.invoiceEmitter.findUnique({ where: { id } });
  },

  listEmitters(tx: Prisma.TransactionClient) {
    return tx.invoiceEmitter.findMany({ orderBy: { code: 'asc' } });
  },

  /**
   * Sum of issued (non-cancelled, non-deleted) comprobante amounts in a window.
   *
   * Restricted to ARS unconditionally, and NOT as a lane convention: a monotributo
   * category limit is a peso figure fixed by ARCA. Summing minor units across
   * currencies would count a USD 1.000 comprobante as 100.000 toward a peso cap,
   * reporting roughly a thousandth of the quota actually consumed and letting the
   * emitter issue far past its legal limit. That is a compliance failure, not a
   * display bug, so it is guarded here rather than left to the caller.
   */
  async issuedMinorInWindow(
    tx: Prisma.TransactionClient,
    emitterId: string,
    start: Date,
    end: Date,
  ): Promise<bigint> {
    const agg = await tx.receivable.aggregate({
      _sum: { totalAmountMinor: true },
      where: {
        emitterId,
        currency: 'ARS',
        invoiceIssuedAt: { gte: start, lt: end },
        deletedAt: null,
        status: { not: 'cancelled' },
      },
    });
    return agg._sum.totalAmountMinor ?? 0n;
  },

  async kpis(tx: Prisma.TransactionClient, where: Prisma.ReceivableWhereInput) {
    // Scope to the ARS operating lane, same convention as
    // `monthlyRepo.cobroActualsByClient`: the KPI DTO carries a single amount with
    // no currency dimension, so summing minor units across ARS/USD would
    // produce a number in no currency at all. The count is filtered with it so the
    // row count and the amount always describe the same set.
    const arsOnly: Prisma.ReceivableWhereInput = { ...where, currency: 'ARS' };
    const [agg, count] = await Promise.all([
      tx.receivable.aggregate({
        _sum: { totalAmountMinor: true, collectedAmountMinor: true },
        where: arsOnly,
      }),
      tx.receivable.count({ where: arsOnly }),
    ]);
    return {
      count,
      billed: agg._sum.totalAmountMinor ?? 0n,
      collected: agg._sum.collectedAmountMinor ?? 0n,
    };
  },
};
