/**
 * Payments service — business logic + DTO mapping. The register mutation is
 * atomic + idempotent (mirrors billing collect); recipient references are
 * validated before creating a payment.
 */
import type { Prisma } from '@hold/db';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { tryRecordIdempotencyKey } from '../../lib/idempotency.js';
import { appendLedger, paymentLedgerEntity } from '../../lib/ledger.js';
import { postTreasuryMovement } from '../../lib/treasury-posting.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { paymentsRepo } from './payments.repo.js';
import {
  bankProfileToDto,
  toPaymentBankDto,
  toPaymentDto,
  toProviderDto,
  type CreatePaymentInput,
  type CreateProviderInput,
  type ListPaymentsQuery,
  type PaginatedPaymentsDto,
  type PaymentBankResponseDto,
  type PaymentDto,
  type PaymentKpisDto,
  type ProviderDto,
  type UpdatePaymentInput,
} from './payments.schema.js';

function monthBoundsOf(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

/**
 * The settlement status is a pure function of paid vs total. Mirrors the atomic CASE in
 * `paymentsRepo.register` — the two must agree, or a payment's status depends on which
 * road last touched it.
 */
function settlementStatusFor(paid: bigint, total: bigint): 'paid' | 'partial' | 'pending' {
  if (paid >= total && total > 0n) return 'paid';
  if (paid > 0n) return 'partial';
  return 'pending';
}

export const paymentsService = {
  // --- Providers -------------------------------------------------------------
  async createProvider(
    tx: Prisma.TransactionClient,
    input: CreateProviderInput,
  ): Promise<ProviderDto> {
    const created = await paymentsRepo.createProvider(tx, { ...input });
    return toProviderDto(created);
  },

  async listProviders(tx: Prisma.TransactionClient): Promise<ProviderDto[]> {
    const rows = await paymentsRepo.listProviders(tx);
    return rows.map(toProviderDto);
  },

  // --- Payments --------------------------------------------------------------
  async list(tx: Prisma.TransactionClient, query: ListPaymentsQuery): Promise<PaginatedPaymentsDto> {
    const where: Prisma.PaymentWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.recipientType ? { recipientType: query.recipientType } : {}),
      ...(query.period
        ? (() => {
            const { start, end } = monthBoundsOf(query.period);
            return { period: { gte: start, lt: end } };
          })()
        : {}),
    };
    const { items, total } = await paymentsRepo.list(tx, where, query.limit, query.offset);
    return { items: items.map(toPaymentDto), total, limit: query.limit, offset: query.offset };
  },

  async getById(tx: Prisma.TransactionClient, id: string): Promise<PaymentDto> {
    const p = await paymentsRepo.findById(tx, id);
    if (!p) {
      throw new NotFoundError(`Payment ${id} not found`);
    }
    return toPaymentDto(p);
  },

  async create(
    tx: Prisma.TransactionClient,
    input: CreatePaymentInput,
  ): Promise<PaymentDto> {
    // Validate the polymorphic recipient reference exists.
    if (input.teamMemberId) {
      const member = await paymentsRepo.findTeamMember(tx, input.teamMemberId);
      if (!member) {
        throw new BadRequestError('teamMemberId does not reference a member in this workspace');
      }
    }
    if (input.providerId) {
      const provider = await paymentsRepo.findProvider(tx, input.providerId);
      if (!provider) {
        throw new BadRequestError('providerId does not reference a provider in this workspace');
      }
    }
    if (input.invoiceEmitterId) {
      const emitter = await paymentsRepo.findInvoiceEmitter(tx, input.invoiceEmitterId);
      if (!emitter) {
        throw new BadRequestError('invoiceEmitterId does not reference an emitter in this workspace');
      }
    }
    const created = await paymentsRepo.create(tx, {
      recipientType: input.recipientType,
      teamMemberId: input.teamMemberId ?? null,
      providerId: input.providerId ?? null,
      invoiceEmitterId: input.invoiceEmitterId ?? null,
      recipientName: input.recipientName,
      period: input.period,
      concept: input.concept,
      totalAmountMinor: input.totalAmountMinor,
      currency: input.currency,
      expectedDate: input.expectedDate,
      ...(input.method !== undefined ? { method: input.method } : {}),
    });
    // Ledger: a charge on the recipient's running account (if it has an entity).
    const ent = paymentLedgerEntity(created);
    if (ent) {
      await appendLedger(tx, {
        ...ent,
        currency: created.currency,
        period: created.period,
        type: 'charge',
        debitMinor: created.totalAmountMinor,
        description: created.concept,
        referenceType: 'payment',
        referenceId: created.id,
      });
    }
    return toPaymentDto(created);
  },

  async update(
    tx: Prisma.TransactionClient,
    id: string,
    input: UpdatePaymentInput,
  ): Promise<PaymentDto> {
    const current = await paymentsRepo.findById(tx, id);
    if (!current) {
      throw new NotFoundError(`Payment ${id} not found`);
    }
    if (current.status === 'cancelled') {
      throw new ConflictError('Cannot edit a cancelled payment');
    }
    const total = input.totalAmountMinor ?? current.totalAmountMinor;
    if (total < current.paidAmountMinor) {
      throw new BadRequestError('Total cannot be below the amount already paid');
    }
    // Raising the total of an ALREADY-SETTLED payment re-opens it. Without this the row keeps
    // `paid` while `total - paid` is genuinely outstanding, so the detail reads "Pagado" over a
    // non-zero balance and the KPIs under-report what is still owed.
    // `pending`/`approved`/`overdue` are lifecycle states with nothing settled yet — a total
    // change must not clobber them (re-deriving would silently un-approve a payment).
    const status =
      current.status === 'paid' || current.status === 'partial'
        ? settlementStatusFor(current.paidAmountMinor, total)
        : current.status;
    const updated = await paymentsRepo.update(tx, id, {
      ...(input.concept !== undefined ? { concept: input.concept } : {}),
      ...(input.expectedDate !== undefined ? { expectedDate: input.expectedDate } : {}),
      ...(input.method !== undefined ? { method: input.method } : {}),
      totalAmountMinor: total,
      status,
      version: { increment: 1 },
    });
    // Keep the recipient's running account in lock-step. Only payments with a
    // ledger entity have one (fixed_expense/monotributo/platform have none).
    const delta = total - current.totalAmountMinor;
    const ent = paymentLedgerEntity(current);
    if (delta !== 0n && ent) {
      await appendLedger(tx, {
        ...ent,
        currency: current.currency,
        period: current.period,
        type: 'adjustment',
        ...(delta > 0n ? { debitMinor: delta } : { creditMinor: -delta }),
        description: `Ajuste ${input.concept ?? current.concept}`,
        referenceType: 'payment',
        referenceId: id,
      });
    }
    return toPaymentDto(updated);
  },

  async approve(
    tx: Prisma.TransactionClient,
    id: string,
    actorUserId: string,
  ): Promise<PaymentDto> {
    const current = await paymentsRepo.findById(tx, id);
    if (!current) {
      throw new NotFoundError(`Payment ${id} not found`);
    }
    if (current.status !== 'pending') {
      throw new ConflictError('Only a pending payment can be approved');
    }
    const updated = await paymentsRepo.update(tx, id, {
      status: 'approved',
      version: { increment: 1 },
    });
    // `notify` owns its own failure boundary (see its doc). It cannot turn a DB failure
    // into a survivable one — nothing at that layer can — but it never propagates its own.
    await notificationsService.notify(tx, actorUserId, {
      type: 'payment.approved',
      title: `Pago aprobado: ${current.recipientName}`,
      body: current.concept,
      entityType: 'payment',
      entityId: id,
    });
    return toPaymentDto(updated);
  },

  /** Atomic, idempotent payment registration (no overpay, no TOCTOU). */
  async register(
    tx: Prisma.TransactionClient,
    id: string,
    amount: bigint,
    opts: {
      idempotencyKey?: string;
      paymentDate?: Date;
      /** WHERE the cash left from. Present → that account's balance drops by exactly
       *  this amount, in this transaction. Absent → nothing moves. */
      treasuryAccountId?: string;
      /** How it was paid. The column has existed since the module shipped and nothing
       *  ever wrote it, so the detail had no medio de pago to show. */
      method?: string;
      userId?: string;
    } = {},
  ): Promise<PaymentDto> {
    if (amount <= 0n) {
      throw new BadRequestError('Payment amount must be positive');
    }
    if (opts.idempotencyKey) {
      const fresh = await tryRecordIdempotencyKey(tx, `pay:${id}`, opts.idempotencyKey);
      if (!fresh) {
        // The treasury movement is inside this guard too, so a retry cannot debit twice.
        return this.getById(tx, id);
      }
    }
    const affected = await paymentsRepo.register(tx, id, amount, opts.paymentDate);
    if (affected === 0) {
      const exists = await paymentsRepo.findById(tx, id);
      if (!exists) {
        throw new NotFoundError(`Payment ${id} not found`);
      }
      throw new ConflictError('Payment would exceed the total, or it is cancelled');
    }
    const p = await paymentsRepo.findById(tx, id);
    const ent = p ? paymentLedgerEntity(p) : null;
    if (p && ent) {
      await appendLedger(tx, {
        ...ent,
        currency: p.currency,
        period: p.period,
        type: 'payment',
        creditMinor: amount,
        description: 'Pago',
        referenceType: 'payment',
        referenceId: p.id,
      });
    }
    if (p && opts.treasuryAccountId) {
      // Before the relation connect below: this is the step that validates the account,
      // and it reports an unknown one as a 400. Connecting first would surface the same
      // bad input as a Prisma "required record not found" — a 404 about the PAGO.
      await postTreasuryMovement(tx, {
        accountId: opts.treasuryAccountId,
        date: opts.paymentDate ?? new Date(),
        direction: 'outflow',
        currency: p.currency,
        amountMinor: amount,
        description: `Pago ${p.recipientName}`,
        referenceType: 'payment',
        referenceId: p.id,
        ...(opts.userId ? { createdByUserId: opts.userId } : {}),
      });
    }
    if (p && (opts.treasuryAccountId || opts.method)) {
      // Remembered on the row so the detail can name the origin and the medio without
      // joining the movement log. Latest wins, same contract as `paymentDate`.
      await paymentsRepo.update(tx, id, {
        ...(opts.treasuryAccountId
          ? { treasuryAccount: { connect: { id: opts.treasuryAccountId } } }
          : {}),
        ...(opts.method ? { method: opts.method } : {}),
      });
    }
    return this.getById(tx, id);
  },

  async cancel(tx: Prisma.TransactionClient, id: string): Promise<PaymentDto> {
    // findById excludes soft-deleted rows, so a payment already cancelled reads
    // as not-found here — a second cancel 404s and never double-reverses.
    const current = await paymentsRepo.findById(tx, id);
    if (!current) {
      throw new NotFoundError(`Payment ${id} not found`);
    }
    const updated = await paymentsRepo.update(tx, id, {
      status: 'cancelled',
      deletedAt: new Date(),
      version: { increment: 1 },
    });
    // Reverse the still-outstanding charge on the recipient's account (the paid
    // part really went out and stays). Skip payments with no ledger entity.
    const outstanding = current.totalAmountMinor - current.paidAmountMinor;
    const ent = paymentLedgerEntity(current);
    if (outstanding > 0n && ent) {
      await appendLedger(tx, {
        ...ent,
        currency: current.currency,
        period: current.period,
        type: 'reversal',
        creditMinor: outstanding,
        description: 'Anulación de pago',
        referenceType: 'payment',
        referenceId: current.id,
      });
    }
    return toPaymentDto(updated);
  },

  /**
   * The banking details of whoever this payment is owed to.
   *
   * `{ bank: null }` covers the two honest absences — a recipient with no ledger
   * counterparty at all (gasto fijo, monotributo, plataforma) and a counterparty
   * with nothing on file — while a payment that does not exist still 404s. The
   * caller must render the two absences the same way and neither as a blank field
   * it invented.
   */
  async recipientBank(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<PaymentBankResponseDto> {
    const payment = await paymentsRepo.findById(tx, id);
    if (!payment) {
      throw new NotFoundError(`Payment ${id} not found`);
    }
    const entity = paymentLedgerEntity(payment);
    if (!entity) {
      return { bank: null };
    }

    // The period's statement FIRST. It is the only banking data the product
    // actually writes today, and it is per-period, so it answers "what account was
    // this month paid into" rather than "what account do we have on file now".
    if (entity.entityType === 'teamMember') {
      const { start, end } = monthBoundsOf(payment.period);
      const profile = await paymentsRepo.findStatementBankProfile(
        tx,
        entity.entityId,
        start,
        end,
      );
      if (profile) {
        return { bank: bankProfileToDto(profile) };
      }
    }

    // Then the counterparty's own `Bank` row — the schema's declared home, and the
    // only route a proveedor has. Empty until something writes one.
    const bank = await paymentsRepo.findCounterpartyBank(tx, entity);
    return { bank: bank ? toPaymentBankDto(bank) : null };
  },

  async kpis(tx: Prisma.TransactionClient, period?: Date): Promise<PaymentKpisDto> {
    const where: Prisma.PaymentWhereInput = {
      deletedAt: null,
      status: { not: 'cancelled' },
      ...(period
        ? (() => {
            const { start, end } = monthBoundsOf(period);
            return { period: { gte: start, lt: end } };
          })()
        : {}),
    };
    const { count, due, paid } = await paymentsRepo.kpis(tx, where);
    return {
      count,
      totalDueMinor: due.toString(),
      totalPaidMinor: paid.toString(),
      totalOutstandingMinor: (due - paid).toString(),
    };
  },
};
