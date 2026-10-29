import { cn } from '@/app/lib/utils'
import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/components'
import { monthStatusBadge } from './monthly-operation-format'
import type { MonthRecord, MonthStatus } from './monthly-operation-mock-data'

const STATUS_DOT_CLASS: Record<MonthStatus, string> = {
  draft: 'bg-accent-gray-emphasis',
  review: 'bg-warning-emphasis',
  closed: 'bg-success-emphasis',
  reopened: 'bg-accent-gray-emphasis',
}

export function MonthSelector({
  months,
  selectedMonthId,
  onSelect,
}: {
  months: MonthRecord[]
  selectedMonthId: string
  onSelect: (id: string) => void
}) {
  const selected = months.find((month) => month.id === selectedMonthId)
  const selectedStatus = selected ? monthStatusBadge(selected.status) : null
  return (
    <Select value={selectedMonthId} onValueChange={onSelect}>
      <SelectTrigger aria-label="Seleccionar mes">
        <SelectValue>
          {selected && selectedStatus ? (
            <span className="flex items-center gap-2">
              {selected.label}
              <Badge variant={selectedStatus.variant} className="hidden lg:inline-flex">
                {selectedStatus.label}
              </Badge>
              <span
                aria-hidden
                className={cn(
                  'inline-block size-2 shrink-0 rounded-full lg:hidden',
                  STATUS_DOT_CLASS[selected.status],
                )}
              />
              <span className="sr-only lg:hidden">{selectedStatus.label}</span>
            </span>
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {months.map((month) => {
          const status = monthStatusBadge(month.status)
          return (
            <SelectItem key={month.id} value={month.id}>
              <span className="flex items-center gap-2">
                {month.label}
                <Badge variant={status.variant}>{status.label}</Badge>
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
