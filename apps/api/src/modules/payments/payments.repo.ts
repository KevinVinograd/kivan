/**
 * Payments repository. Runs on the `tx` from runInTx. The
 * `register` mutation is a single guarded UPDATE — the WHERE clause enforces the
 * no-overpay invariant atomically (no read-then-write TOCTOU), mirroring the
 * billing collect.
 */
import type { Prisma } from '@hold/db';

/**
 * Where a payment's money left from, joined for display. Applied to every read that
 * feeds `toPaymentDto`, so the detail can name the account without a second round-trip
 * and no path returns a row the mapper cannot describe.
 */
const paymentInclude = {
  treasuryAccount: { select: { name: true } },
} satisfies Prisma.PaymentInclude;

export const paymentsRepo = {
  // --- Providers -------------------------------------------------------------
  createProvider(tx: Prisma.TransactionClient, data: Prisma.ProviderUncheckedCreateInput) {
    return tx.provider.create({ data });
  },
  listProviders(tx: Prisma.TransactionClient) {
    return tx.provider.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
  },
  findProvider(tx: Prisma.TransactionClient, id: string) {
    return tx.provider.findFirst({ where: { id, deletedAt: null } });
  },
  /** `InvoiceEmitter` has no soft delete — it is workspace configuration, not a record
   *  that comes and goes — so existence is the whole check. */
  findInvoiceEmitter(tx: Prisma.TransactionClient, id: string) {
    return tx.invoiceEmitter.findFirst({ where: { id } });
  },

  // --- Payments --------------------------------------------------------------
  async list(
    tx: Prisma.TransactionClient,
    where: Prisma.PaymentWhereInput,
    limit: number,
    offset: number,
  ) {
    const [items, total] = await Promise.all([
      tx.payment.findMany({
        where,
        include: paymentInclude,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      tx.payment.count({ where }),
    ]);
    return { items, total };
  },

  findById(tx: Prisma.TransactionClient, id: string) {
    return tx.payment.findFirst({ where: { id, deletedAt: null }, include: paymentInclude });
  },

  findTeamMember(tx: Prisma.TransactionClient, id: string) {
    return tx.teamMember.findFirst({ where: { id, deletedAt: null } });
  },

  /**
   * The bank details a payout statement carries for (member, period), or null.
   *
   * THIS is where banking data actually lives today. `Operación mensual` writes it
   * through `payoutsApi.upsert({ bankProfile })`
   * (`src/app/pages/monthly-operation-data.tsx`), and it is per-period on purpose:
   * an account someone changed in August must not restate what July was paid into.
   */
  async findStatementBankProfile(
    tx: Prisma.TransactionClient,
    teamMemberId: string,
    start: Date,
    end: Date,
  ) {
    const statement = await tx.payoutStatement.findFirst({
      where: { teamMemberId, period: { gte: start, lt: end }, deletedAt: null },
      select: { bankProfile: true },
    });
    return statement?.bankProfile ?? null;
  },

  /**
   * The `Bank` row a counterparty points at, or null.
   *
   * A FALLBACK, and today an empty one: nothing in the application writes a `Bank`
   * row or sets `TeamMember.bankId` / `Provider.bankId` — the create-provider
   * schema accepts a `bankId` that can only reference a row no code path creates,
   * and `src/app/pages/team-api-data.ts` says the same of the team dialog. Reading
   * only this table is how the first version of this endpoint came to answer
   * `{ bank: null }` for every payment in production while its test passed on a row
   * seeded by raw SQL.
   *
   * Kept rather than deleted because `Bank` is the schema's declared home for this
   * data and the relation is the one place a proveedor could ever have it; it costs
   * one indexed lookup and starts working the day a write path exists.
   *
   * Keyed off the SAME `{entityType, entityId}` the ledger uses, so `Datos de pago`
   * and `Cuenta corriente` can never describe two different counterparties.
   */
  async findCounterpartyBank(
    tx: Prisma.TransactionClient,
    entity: { entityType: string; entityId: string },
  ) {
    const owner =
      entity.entityType === 'provider'
        ? await tx.provider.findFirst({
            where: { id: entity.entityId, deletedAt: null },
            select: { bankId: true },
          })
        : await tx.teamMember.findFirst({
            where: { id: entity.entityId, deletedAt: null },
            select: { bankId: true },
          });
    if (!owner?.bankId) {
      return null;
    }
    return tx.bank.findFirst({ where: { id: owner.bankId } });
  },

  create(tx: Prisma.TransactionClient, data: Prisma.PaymentUncheckedCreateInput) {
    return tx.payment.create({ data, include: paymentInclude });
  },

  update(tx: Prisma.TransactionClient, id: string, data: Prisma.PaymentUpdateInput) {
    return tx.payment.update({ where: { id }, data, include: paymentInclude });
  },

  /**
   * ATOMIC register (no TOCTOU). One guarded UPDATE: applies `amount` and
   * recomputes the payment status ONLY if the row exists, isn't cancelled, and
   * the new paid total would not exceed the payment total. Returns rows updated
   * (1 = applied, 0 = not found / would-overpay).
   */
  async register(
    tx: Prisma.TransactionClient,
    id: string,
    amount: bigint,
    /** When the money moved. Defaults to now for a payment registered as it happens. */
    paymentDate: Date = new Date(),
  ): Promise<number> {
    return tx.$executeRaw`
      UPDATE "Payment"
      SET "paidAmountMinor" = "paidAmountMinor" + ${amount},
          "status" = CASE
            WHEN "paidAmountMinor" + ${amount} >= "totalAmountMinor" THEN 'paid'::"PaymentStatus"
            WHEN "paidAmountMinor" + ${amount} > 0 THEN 'partial'::"PaymentStatus"
            ELSE 'pending'::"PaymentStatus"
          END,
          "paymentDate" = ${paymentDate},
          "version" = "version" + 1,
          "updatedAt" = now()
      WHERE "id" = ${id}::uuid
        AND "deletedAt" IS NULL
        AND "status" <> 'cancelled'::"PaymentStatus"
        AND ${amount} > 0
        AND "paidAmountMinor" + ${amount} <= "totalAmountMinor"`;
  },

  async kpis(tx: Prisma.TransactionClient, where: Prisma.PaymentWhereInput) {
    // Scope to the ARS operating lane, same convention as
    // `monthlyRepo.cobroActualsByClient`: the KPI DTO carries a single amount with
    // no currency dimension, so summing minor units across ARS/USD would
    // produce a number in no currency at all. The count is filtered with it so the
    // row count and the amount always describe the same set.
    const arsOnly: Prisma.PaymentWhereInput = { ...where, currency: 'ARS' };
    const [agg, count] = await Promise.all([
      tx.payment.aggregate({
        _sum: { totalAmountMinor: true, paidAmountMinor: true },
        where: arsOnly,
      }),
      tx.payment.count({ where: arsOnly }),
    ]);
    return {
      count,
      due: agg._sum.totalAmountMinor ?? 0n,
      paid: agg._sum.paidAmountMinor ?? 0n,
    };
  },
};
