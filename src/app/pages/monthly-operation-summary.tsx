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

/**
 * Solid status-dot fill shown in the compact (below-desktop) trigger, matched to
 * the month-status badge tone. Draft/reopened read as neutral gray; review = warning,
 * closed = success. Theme-safe semantic emphasis fills (no raw values).
 */
const STATUS_DOT_CLASS: Record<MonthStatus, string> = {
  draft: 'bg-accent-gray-emphasis',
  review: 'bg-warning-emphasis',
  closed: 'bg-success-emphasis',
  reopened: 'bg-accent-gray-emphasis',
}

/** Month picker — switches the active month record (open months are live, closed are locked). */
export function MonthSelector({
  months,
  selectedMonthId,
  onSelect,
}: {
  months: MonthRecord[]
  selectedMonthId: string
  onSelect: (id: string) => void
}) {
  // Full Select on every viewport (no below-desktop icon collapse) — the period
  // switch stays a labelled dropdown on mobile and tablet, not a calendar icon.
  const selected = months.find((month) => month.id === selectedMonthId)
  const selectedStatus = selected ? monthStatusBadge(selected.status) : null
  return (
    <Select value={selectedMonthId} onValueChange={onSelect}>
      <SelectTrigger aria-label="Seleccionar mes">
        {/* The custom content goes INSIDE `SelectValue`, never instead of it.

            Radix sets its internal `valueNode` from `SelectValue`'s ref alone, and the
            default `item-aligned` placement REFUSES to position the listbox while that
            node is null. Rendering a bare `<span>` here instead left the popup mounted
            with only `position: fixed` and no `left`/`top` — so it painted at the very
            bottom edge, off-screen, with all thirteen months in it. And because Radix
            hardcodes `disableOutsidePointerEvents` on Select content, the ENTIRE page
            went `pointer-events: none` while that invisible list was open.

            To the operator: click the month, nothing appears, and now nothing else on
            the page responds either. Reported from production as "hago click y no me
            abre" by someone trying to reach a past month. Measured on the real app:
            aria-expanded="true", wrapper top = viewport height, 13 options, 0 visible.

            Passing explicit children also sets `valueNodeHasChildren`, which switches
            OFF the `SelectItemText` portal into the value node — the cross-tree text
            move that `select.tsx` documents as the machine-translation crash. So this
            is strictly safer than the bare `<SelectValue />` the else-branch uses. */}
        <SelectValue>
          {selected && selectedStatus ? (
            // Trigger differs from the list: month + year always; the full status
            // badge only on desktop, collapsing to a colored status dot below it
            // (tablet + mobile) so the control stays compact where space is tight.
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
