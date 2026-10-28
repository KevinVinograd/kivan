import type { ProductionInput } from './monthly-operation-data'

const minor = (major: number): string => String(Math.round(major * 100))

/**
 * Create and update send the SAME body, built here once, and so does a production loaded
 * from a person or a client (`addMemberProductionViaApi`).
 *
 * Two mappers would be two places to add a field to, and the one you forget is the one that
 * silently drops the value on save — the form shows it, the row never gets it, and nothing errors.
 * The per-person dialogs had exactly that: their own body, with "Cantidad" smuggled into notes.
 */
export function productionPayload(input: ProductionInput) {
  return {
    date: input.date,
    clientId: input.clientId || null,
    clientName: input.clientName || null,
    title: input.title,
    type: input.type,
    // Picked by id, the creator IS the attribution: their hours reach their liquidación
    // and the names are derived server-side. A row from before the picker, with no
    // creator chosen, keeps travelling as names so an edit cannot erase them.
    ...(input.creatorId
      ? { attribution: [{ teamMemberId: input.creatorId, hours: input.hours, role: 'responsible' as const }] }
      : { responsible: input.responsible, participants: input.participants }),
    hours: input.hours,
    viaticsMinor: minor(input.viatics),
    // Omitted unless typed: the API then prices it as hours × the creator's rate.
    ...(input.costEdited || !input.creatorId ? { totalCostMinor: minor(input.totalCost) } : {}),
    accountManagerId: input.accountManagerId,
    viaticsPaidAt: input.viaticsPaidAt || null,
    receipt: input.receipt.trim() || null,
    billable: input.billable,
    ...(input.billAmount ? { billAmountMinor: minor(input.billAmount) } : {}),
    notes: input.notes,
    // Sent as null too, so choosing "Sin servicio" on an edit actually unlinks it.
    clientServiceId: input.clientServiceId,
  }
}
