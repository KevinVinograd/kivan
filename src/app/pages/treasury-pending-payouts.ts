import { payoutsApi, type PayoutStatementDto } from '@/api/payouts'

export type PendingPayout = {
  id: string
  teamMemberId: string
  label: string
  date: string
  amount: number
}

const PAGE = 100

export async function fetchOutstandingPayouts(): Promise<PayoutStatementDto[]> {
  const all: PayoutStatementDto[] = []
  for (let offset = 0; ; offset += PAGE) {
    const res = await payoutsApi.list({ limit: PAGE, offset })
    all.push(...res.items)
    if (all.length >= res.total || res.items.length < PAGE) break
  }
  return all.filter((dto) => Number(dto.outstandingMinor) > 0)
}

export function pendingPayoutRows(
  dtos: PayoutStatementDto[],
  memberNameById: Record<string, string>,
): PendingPayout[] {
  return dtos.map((dto) => ({
    id: `payout-${dto.id}`,
    teamMemberId: dto.teamMemberId,
    label: memberNameById[dto.teamMemberId] ?? `Liquidación ${dto.period.slice(0, 7)}`,
    date: dto.dueDate ?? dto.period,
    amount: Number(dto.outstandingMinor) / 100,
  }))
}
