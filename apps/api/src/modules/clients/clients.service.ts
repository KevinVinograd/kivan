/** Clients service — business logic + DTO mapping over the repo. */
import type { Prisma } from '@hold/db';
import { minor, type ClientStatus } from '@hold/shared';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { repriceHourLine } from '../monthly/production-pack.js';
import { clientsRepo } from './clients.repo.js';
import {
  toAssignmentDto,
  toClientDto,
  type ClientAssignmentDto,
  type ClientDto,
  type CreateAssignmentInput,
  type UpdateAssignmentInput,
  type CreateServiceLineInput,
  type UpdateServiceLineInput,
  type ClientServiceDto,
  toServiceLineDto,
  type CreateClientInput,
  type PaginatedClientsDto,
  type UpdateClientInput,
} from './clients.schema.js';

interface ListOptions {
  limit: number;
  offset: number;
  assignedToMemberId?: string | null;
}

export const clientsService = {
  async list(tx: Prisma.TransactionClient, opts: ListOptions): Promise<PaginatedClientsDto> {
    const { items, total } = await clientsRepo.list(tx, opts);
    return { items: items.map(toClientDto), total, limit: opts.limit, offset: opts.offset };
  },

  async getById(
    tx: Prisma.TransactionClient,
    id: string,
    assignedToMemberId?: string | null,
  ): Promise<ClientDto> {
    // Employees may read only clients they're actively assigned to; 404 (not
    // 403) for anything else so existence isn't disclosed.
    const client =
      assignedToMemberId === undefined
        ? await clientsRepo.findById(tx, id)
        : assignedToMemberId === null
          ? null
          : await clientsRepo.findByIdAssignedTo(tx, id, assignedToMemberId);
    if (!client) {
      throw new NotFoundError(`Client ${id} not found`);
    }
    return toClientDto(client);
  },

  async create(
    tx: Prisma.TransactionClient,
    input: CreateClientInput,
  ): Promise<ClientDto> {
    const created = await clientsRepo.create(tx, { ...input });
    return toClientDto(created);
  },

  async update(
    tx: Prisma.TransactionClient,
    id: string,
    input: UpdateClientInput,
  ): Promise<ClientDto> {
    const current = await this.getById(tx, id);
    // A client priced by service lines has a fee the SERVER maintains as the sum of its
    // monthly lines. The edit dialog sends `monthlyFeeMinor` on every save, so without
    // this a typed number silently replaced the sum — the drawer then showed a breakdown
    // that no longer added up to the fee being billed. The unchanged value (what the
    // dialog sends when nobody touched the field) passes; a different one is refused
    // with the place where it CAN be changed.
    if (
      input.monthlyFeeMinor !== undefined &&
      input.monthlyFeeMinor.toString() !== current.monthlyFeeMinor &&
      (await clientsRepo.isPricedByLines(tx, id))
    ) {
      throw new BadRequestError(
        'El fee mensual de este cliente se calcula con sus servicios mensuales. Cambialo desde Servicios valorizados.',
      );
    }
    const updated = await clientsRepo.update(tx, id, input);
    return toClientDto(updated);
  },

  async changeStatus(
    tx: Prisma.TransactionClient,
    id: string,
    status: ClientStatus,
  ): Promise<ClientDto> {
    await this.getById(tx, id);
    const updated = await clientsRepo.update(tx, id, { status });
    return toClientDto(updated);
  },

  /**
   * Delete a client (soft — `deletedAt`). Distinct from `changeStatus(id,
   * 'churned')`: a baja keeps the client on the roster as a former account,
   * while this removes it from every read. `getById` first, so an absent
   * id is a 404 before anything is written.
   */
  async remove(tx: Prisma.TransactionClient, id: string): Promise<ClientDto> {
    await this.getById(tx, id);
    const removed = await clientsRepo.softDelete(tx, id);
    return toClientDto(removed);
  },

  async listAssignments(
    tx: Prisma.TransactionClient,
    clientId: string,
    includeCost: boolean,
    assignedToMemberId?: string | null,
  ): Promise<ClientAssignmentDto[]> {
    await this.getById(tx, clientId, assignedToMemberId);
    const rows = await clientsRepo.listAssignments(tx, clientId);
    // Arrow, never a bare `rows.map(toAssignmentDto)` — that passes the array index
    // as `includeCost`. The mapper's required second parameter makes it a compile
    // error, and this is the shape it forces.
    return rows.map((r) => toAssignmentDto(r, includeCost));
  },

  /**
   * Every active assignment in the workspace; an employee sees only their own.
   *
   * Takes the whole scope rather than a pre-derived id, so a null `teamMemberId`
   * cannot be mistaken for "unscoped" on the way down — see the repo.
   */
  async listAllAssignments(
    tx: Prisma.TransactionClient,
    scope: { role: string; teamMemberId: string | null },
    includeCost: boolean,
  ): Promise<ClientAssignmentDto[]> {
    const rows = await clientsRepo.listAllAssignments(tx, scope);
    return rows.map((r) => toAssignmentDto(r, includeCost));
  },

  /**
   * Every client a member is actively assigned to.
   *
   * The caller's authority is decided by the ROUTE, not here: this is the mirror of
   * `listAssignments`, and the subject is the member rather than the client, so
   * "may I read this?" is a different question with a different answer.
   */
  async listAssignmentsForMember(
    tx: Prisma.TransactionClient,
    teamMemberId: string,
    includeCost: boolean,
  ): Promise<ClientAssignmentDto[]> {
    const rows = await clientsRepo.listAssignmentsForMember(tx, teamMemberId);
    return rows.map((r) => toAssignmentDto(r, includeCost));
  },

  async addAssignment(
    tx: Prisma.TransactionClient,
    clientId: string,
    input: CreateAssignmentInput,
    includeCost: boolean,
  ): Promise<ClientAssignmentDto> {
    await this.getById(tx, clientId);
    const member = await clientsRepo.findTeamMember(tx, input.teamMemberId);
    if (!member) {
      throw new BadRequestError('teamMemberId does not reference a member in this workspace');
    }
    if (input.serviceId) {
      const service = await clientsRepo.findService(tx, input.serviceId);
      if (!service) {
        throw new BadRequestError('serviceId does not reference a service in this workspace');
      }
    }
    const created = await clientsRepo.createAssignment(tx, {
      ...input,
      clientId,
      // The relationship starts now. Left null, `/team` renders "Sin fecha de inicio"
      // and cannot compute tenure — and `endedAt` is stamped on the way out, so an
      // assignment would carry an end with no beginning. The local-state version this
      // replaced set a start date; not carrying it over would have been a regression
      // in what the record says.
      assignedSince: new Date(),
    });
    return toAssignmentDto(created, includeCost);
  },

  async endAssignment(
    tx: Prisma.TransactionClient,
    id: string,
    includeCost: boolean,
  ): Promise<ClientAssignmentDto> {
    const existing = await clientsRepo.findAssignment(tx, id);
    if (!existing) {
      throw new NotFoundError(`Assignment ${id} not found`);
    }
    const ended = await clientsRepo.endAssignment(tx, id);
    return toAssignmentDto(ended, includeCost);
  },

  /**
   * Correct an assignment in place.
   *
   * Without this, fixing a mistyped cost means ending the assignment and creating a
   * new one — the partial unique index on (client, member) WHERE status <> 'ended'
   * allows nothing else — and that rewrites the member's tenure line, so a typo reads
   * as a staffing change ever after.
   */
  async updateAssignment(
    tx: Prisma.TransactionClient,
    id: string,
    input: UpdateAssignmentInput,
    includeCost: boolean,
  ): Promise<ClientAssignmentDto> {
    const existing = await clientsRepo.findAssignment(tx, id);
    if (!existing) {
      throw new NotFoundError(`Assignment ${id} not found`);
    }
    // An ended assignment is history. Editing what a finished relationship cost would
    // restate a period the studio has already paid out on.
    if (existing.status === 'ended') {
      throw new BadRequestError('Cannot edit an assignment that has ended');
    }
    if (input.serviceId) {
      const service = await clientsRepo.findService(tx, input.serviceId);
      if (!service) {
        throw new BadRequestError('serviceId does not reference a service in this workspace');
      }
    }
    const updated = await clientsRepo.updateAssignment(tx, id, input);
    return toAssignmentDto(updated, includeCost);
  },

  // ── Priced contract lines ─────────────────────────────────────────────────

  async listServiceLines(
    tx: Prisma.TransactionClient,
    clientId: string,
    assignedToMemberId?: string | null,
  ): Promise<ClientServiceDto[]> {
    await this.getById(tx, clientId, assignedToMemberId);
    const rows = await clientsRepo.listServiceLines(tx, clientId);
    const billed = await clientsRepo.billedByServiceLine(
      tx,
      rows.filter((r) => r.billingMode === 'one_time').map((r) => r.id),
    );
    return rows.map((r) => toServiceLineDto(r, billed.get(r.id) ?? null));
  },

  /**
   * Add a priced service to a client's contract, and recompute the fee.
   *
   * The recompute is in the SAME transaction as the write, because
   * `Client.monthlyFeeMinor` is a cached sum: a line written without it, or a fee
   * written without the line, leaves the client billing a number that does not match
   * its own breakdown — and the generator reads the cache, not the lines.
   */
  async addServiceLine(
    tx: Prisma.TransactionClient,
    clientId: string,
    input: CreateServiceLineInput,
  ): Promise<ClientServiceDto> {
    await this.getById(tx, clientId);
    if (input.serviceId) {
      const service = await clientsRepo.findService(tx, input.serviceId);
      if (!service) {
        throw new BadRequestError('serviceId does not reference a service in this workspace');
      }
    }
    const created = await clientsRepo.createServiceLine(tx, {
      ...input,
      includedHours: input.billingMode === 'per_hour' ? (input.includedHours ?? null) : null,
      clientId,
    });
    await this.recomputeGuarded(tx, clientId);
    return this.lineDto(tx, created);
  },

  async updateServiceLine(
    tx: Prisma.TransactionClient,
    id: string,
    input: UpdateServiceLineInput,
  ): Promise<ClientServiceDto> {
    const existing = await clientsRepo.findServiceLine(tx, id);
    if (!existing) {
      throw new NotFoundError(`Service line ${id} not found`);
    }
    // A per-production or per-hour line with productions still waiting to be billed cannot
    // change mode: as a monthly line its price would be billed as retainer AND the
    // productions behind it again, and every edit of those productions would start failing
    // the link check. Bill them (or unlink them) first.
    if (
      input.billingMode !== undefined &&
      input.billingMode !== existing.billingMode &&
      (existing.billingMode === 'per_production' || existing.billingMode === 'per_hour') &&
      (await clientsRepo.countPendingProductions(tx, id)) > 0
    ) {
      throw new ConflictError(
        'Este servicio tiene producciones sin cobrar. Cobralas o desvinculalas antes de cambiarle el tipo.',
      );
    }
    // The same check `addServiceLine` makes, so a bad id is a clean 400 instead of a raw
    // FK violation.
    if (input.serviceId) {
      const service = await clientsRepo.findService(tx, input.serviceId);
      if (!service) {
        throw new BadRequestError('serviceId does not reference a service in this workspace');
      }
    }
    // Included hours only mean something on a per-hour line: leaving it for any other mode
    // clears them, so a line switched back to per-hour later does not resurrect a stale pack.
    const mode = input.billingMode ?? existing.billingMode;
    const updated = await clientsRepo.updateServiceLine(tx, id, {
      ...input,
      ...(mode !== 'per_hour' ? { includedHours: null } : {}),
    });
    await this.recomputeGuarded(tx, existing.clientId);
    // A new hourly price or a new pack re-bills the line's productions not yet on a cobro;
    // a billed one keeps its amount, its cobro is already out.
    if (input.priceMinor !== undefined || input.includedHours !== undefined) {
      await repriceHourLine(tx, id);
    }
    // The client's LAST monthly line just became one-time or per-production. Its price was
    // the fee; left in place (the recompute returns null with no monthly line), it would
    // be billed every month as an "abono" nobody typed — and, as a one-time line, could
    // then be charged again in full. The price moved to its new path, so the retainer is 0.
    // Only on a MODE change: removing or deactivating the last line keeps the old, safe
    // direction (the client goes back to billing the amount as a hand-typed abono).
    if (
      existing.billingMode === 'monthly' &&
      input.billingMode !== undefined &&
      input.billingMode !== 'monthly' &&
      !(await clientsRepo.isPricedByLines(tx, existing.clientId))
    ) {
      await clientsRepo.update(tx, existing.clientId, { monthlyFeeMinor: minor(0n) });
    }
    return this.lineDto(tx, updated);
  },

  async removeServiceLine(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<ClientServiceDto> {
    const existing = await clientsRepo.findServiceLine(tx, id);
    if (!existing) {
      throw new NotFoundError(`Service line ${id} not found`);
    }
    const removed = await clientsRepo.softDeleteServiceLine(tx, id);
    await this.recomputeGuarded(tx, existing.clientId);
    return this.lineDto(tx, removed);
  },

  /** One line's DTO, with its billed amount when it is a one-time price. */
  async lineDto(
    tx: Prisma.TransactionClient,
    line: Parameters<typeof toServiceLineDto>[0],
  ): Promise<ClientServiceDto> {
    if (line.billingMode !== 'one_time') return toServiceLineDto(line, null);
    const billed = await clientsRepo.billedByServiceLine(tx, [line.id]);
    return toServiceLineDto(line, billed.get(line.id) ?? null);
  },

  /**
   * Recompute the fee, refusing the one outcome that removes a client from billing.
   *
   * A fee of zero drops the client out of `listMonthlyFeeClients` (`monthlyFeeMinor >
   * 0`), so it stops being offered by the Generar-cobros dialog with NO error anywhere
   * and resurfaces only in the "sin abono cargado" list — precisely where the operator
   * expects to see project-only clients. The month runs green and the client is never
   * invoiced.
   *
   * Note what does NOT reach zero: removing or deactivating every line returns null,
   * not 0n, so the client simply keeps the fee its lines last summed to and goes back
   * to billing it as a hand-typed amount. That is the safe direction and it is why
   * un-pricing a client cannot un-bill them. The only way here is an active MONTHLY
   * line priced at 0 with no other monthly line, which is refused.
   *
   * Refused rather than warned: this is a write that silently stops money, and the
   * operator has two honest alternatives — price the line, or change its billing mode.
   *
   * A client with NO monthly line is not this case either: its fee is the hand-typed
   * one, whatever other lines it carries, and the operator edits it in the dialog.
   */
  async recomputeGuarded(tx: Prisma.TransactionClient, clientId: string): Promise<void> {
    const total = await clientsRepo.recomputeMonthlyFee(tx, clientId);
    // Only reachable with monthly lines: without one the recompute returns null and the
    // hand-typed fee stands.
    if (total === 0n) {
      throw new BadRequestError(
        'Los servicios mensuales suman $0. Cargá un importe o cambiá el tipo de cobro del servicio.',
      );
    }
  },
};
