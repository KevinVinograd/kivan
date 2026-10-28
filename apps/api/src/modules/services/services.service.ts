/**
 * Service catalog — the named services a client is assigned people for
 * (Redes, Ads, Producción, Branding…).
 *
 * WHY THIS MODULE EXISTS. `ClientAssignment.serviceId` has been validated against
 * this table since the assignment endpoints shipped
 * (`clients.service.ts` → `findService`), but nothing in the application could ever
 * CREATE a row here: no module, no route, no write path anywhere. A foreign key
 * pointing at a table only migrations can fill is a field that is permanently null
 * in production while reading as supported — the same defect the `Bank` table had,
 * found twice in two branches, which is why `fk-write-path-check.mjs` now fails the
 * build on the third.
 */
import type { Prisma } from '@hold/db';
import { ConflictError } from '../../lib/errors.js';
import { servicesRepo } from './services.repo.js';
import { toServiceDto, type CreateServiceInput, type ServiceDto } from './services.schema.js';

export const servicesService = {
  async list(tx: Prisma.TransactionClient): Promise<ServiceDto[]> {
    const rows = await servicesRepo.list(tx);
    return rows.map(toServiceDto);
  },

  async create(
    tx: Prisma.TransactionClient,
    input: CreateServiceInput,
  ): Promise<ServiceDto> {
    // Checked before inserting so a duplicate is a 409 the dialog can act on
    // ("that service already exists, here it is") rather than a 500 raised by the
    // unique index halfway through a transaction the caller cannot interpret.
    const existing = await servicesRepo.findByName(tx, input.name);
    if (existing) {
      throw new ConflictError(`A service named "${existing.name}" already exists`);
    }
    const created = await servicesRepo.create(tx, { name: input.name });
    return toServiceDto(created);
  },
};
