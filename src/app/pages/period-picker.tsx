import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  IconButton,
} from '@/app/components/components'
import { AFFORDANCE } from '@/app/lib/icon-registry'

/**
 * PeriodPicker — a compact calendar icon-button that opens a DropdownMenu of the
 * available periods. It is the period switch for space-constrained surfaces where
 * the full PageHeader period selector is not shown — most notably the master-detail
 * DETAIL view, where the header is dissolved and inert, so the period can be changed without
 * closing the open record. A page-level helper composed from
 * IconButton + DropdownMenu (mirrors MonthSelector), not a
 * design-system primitive. Generic over the period id: the consumer supplies the
 * id list, the current value, the change handler, and a label formatter.
 */
export function PeriodPicker({
  periods,
  selected,
  onSelect,
  formatLabel,
  ariaLabel = 'Cambiar período',
}: {
  periods: readonly string[]
  selected: string
  onSelect: (period: string) => void
  formatLabel: (period: string) => string
  ariaLabel?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton variant="transparent" color="primary" aria-label={ariaLabel}>
          <AFFORDANCE.datePicker className="size-5" aria-hidden />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {periods.map((period) => (
          <DropdownMenuCheckboxItem
            key={period}
            checked={period === selected}
            onCheckedChange={() => onSelect(period)}
          >
            {formatLabel(period)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
