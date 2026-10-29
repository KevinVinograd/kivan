import { monthlyApi, type ProductionDto } from '@/api/monthly'
import type { PayoutStatementDto } from '@/api/payouts'
import { toMajor } from '@/lib/money'
import {
  PAYMENT_DUE_DAY,
  type MonthlyTeamStatement,
  type ProductionEntry,
  type TeamPaymentStatus,
} from './team-mock-data'

export function payoutPaymentStatus(dto: PayoutStatementDto): TeamPaymentStatus {
  const outstanding = Number(dto.outstandingMinor ?? '0')
  const paid = Number(dto.paidAmountMinor ?? '0')
  switch (dto.statementStatus) {
    case 'draft':
      return 'pending'
    case 'confirmed':
      return outstanding > 0 ? 'with_difference' : 'paid'
    case 'dispatched':
      return 'processing'
    case 'approved':
      return paid > 0 && outstanding > 0 ? 'with_difference' : 'approved'
  }
}

export function payoutToStatement(dto: PayoutStatementDto, monthId: string): MonthlyTeamStatement {
  const totalAmount = toMajor(dto.totalAmountMinor)
  const paidAmount = toMajor(dto.paidAmountMinor)
  const status = payoutPaymentStatus(dto)
  return {
    id: dto.id,
    teamMemberId: dto.teamMemberId,
    month: monthId,
    baseAmount: toMajor(dto.baseAmountMinor),
    hoursAmount: 0,
    productionsAmount: toMajor(dto.productionsAmountMinor),
    extrasAmount: 0,
    expensesAmount: toMajor(dto.viaticsAmountMinor),
    adjustmentsAmount: toMajor(dto.adjustmentsTotalMinor),
    deductionsAmount: 0,
    totalAmount,
    status,
    paidAmount,
    differenceAmount: toMajor(dto.outstandingMinor),
    dueDate: dto.dueDate?.slice(0, 10) ?? `${monthId}-${String(PAYMENT_DUE_DAY).padStart(2, '0')}`,
    approvedAt: dto.approvedAt?.slice(0, 10),
    paidAt: dto.paidAt ?? undefined,
  }
}

export function payoutsByMember(
  dtos: PayoutStatementDto[],
  monthId: string,
): Record<string, MonthlyTeamStatement> {
  const byMember: Record<string, MonthlyTeamStatement> = {}
  for (const dto of dtos) byMember[dto.teamMemberId] = payoutToStatement(dto, monthId)
  return byMember
}

export async function fetchPeriodPayouts(monthId: string): Promise<PayoutStatementDto[]> {
  const bundle = await monthlyApi.getBundle(monthId)
  return bundle.payouts
}

export async function fetchPeriodPlan(
  monthId: string,
): Promise<{ payouts: PayoutStatementDto[]; productions: ProductionDto[] }> {
  const bundle = await monthlyApi.getBundle(monthId)
  return { payouts: bundle.payouts, productions: bundle.productions }
}

export function productionsToEntries(rows: ProductionDto[]): ProductionEntry[] {
  return rows.flatMap((row) =>
    (row.attribution ?? []).map((who) => ({
      id: `${row.id}:${who.teamMemberId}`,
      teamMemberId: who.teamMemberId,
      clientId: row.clientId ?? '',
      clientName: row.clientName ?? '',
      date: row.date,
      type: row.type,
      hours: who.hours ?? undefined,
      amount: toMajor(row.totalCostMinor),
      status: (row.status === 'invoiced' ? 'approved' : row.status) as ProductionEntry['status'],
      notes: row.notes ?? undefined,
      loggedBy: row.responsible ?? undefined,
    })),
  )
}
