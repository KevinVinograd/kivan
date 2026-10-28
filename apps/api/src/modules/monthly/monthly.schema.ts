/** Edge validation (Zod) + DTOs for the Monthly Operation (close) module. */
import { z } from 'zod';

export const periodParamSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be YYYY-MM'),
});

export interface ClientActualDto {
  clientId: string;
  totalBilledMinor: string;
  collectedMinor: string;
}

export interface MemberActualDto {
  teamMemberId: string;
  totalMinor: string;
  paidMinor: string;
}

export interface ActualsDto {
  period: string;
  receivables: {
    count: number;
    totalBilledMinor: string;
    totalCollectedMinor: string;
    /**
     * Live receivables in the month that these figures do NOT describe.
     *
     * The totals are the peso lane. This value is frozen alongside them, so a month that
     * billed in another lane is recorded as having done so instead of reading as a month
     * with less money in it. The snapshot is append-only and a reclose recomputes the same
     * way, so an omission left unstated here is permanent.
     */
    otherLaneCount: number;
    byClient: ClientActualDto[];
  };
  payouts: {
    count: number;
    totalMinor: string;
    paidMinor: string;
    byMember: MemberActualDto[];
  };
}

export interface CloseBlockerDto {
  code: string;
  message: string;
  count: number;
}

export interface MonthRecordDto {
  id: string;
  period: string;
  label: string;
  status: string;
  closedAt: string | null;
  closedByUserId: string | null;
}

export interface MonthDetailDto extends MonthRecordDto {
  frozen: boolean;
  snapshotVersion: number | null;
  actuals: ActualsDto;
}

interface MonthRecordRecord {
  id: string;
  period: string;
  label: string;
  status: string;
  closedAt: Date | null;
  closedByUserId: string | null;
}

export function toMonthRecordDto(r: MonthRecordRecord): MonthRecordDto {
  return {
    id: r.id,
    period: r.period,
    label: r.label,
    status: r.status,
    closedAt: r.closedAt?.toISOString() ?? null,
    closedByUserId: r.closedByUserId,
  };
}
