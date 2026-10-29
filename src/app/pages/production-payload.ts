import type { ProductionInput } from './monthly-operation-data'

const minor = (major: number): string => String(Math.round(major * 100))

export function productionPayload(input: ProductionInput) {
  return {
    date: input.date,
    clientId: input.clientId || null,
    clientName: input.clientName || null,
    title: input.title,
    type: input.type,
    ...(input.creatorId
      ? { attribution: [{ teamMemberId: input.creatorId, hours: input.hours, role: 'responsible' as const }] }
      : { responsible: input.responsible, participants: input.participants }),
    hours: input.hours,
    viaticsMinor: minor(input.viatics),
    ...(input.costEdited || !input.creatorId ? { totalCostMinor: minor(input.totalCost) } : {}),
    accountManagerId: input.accountManagerId,
    viaticsPaidAt: input.viaticsPaidAt || null,
    receipt: input.receipt.trim() || null,
    billable: input.billable,
    ...(input.billAmount ? { billAmountMinor: minor(input.billAmount) } : {}),
    notes: input.notes,
    clientServiceId: input.clientServiceId,
  }
}
