import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/components'
import { formatMonthYear } from './reports-format'
import { type ReportPeriod } from './reports-periods'

/** Re-export so report tabs source the generic filters popover from one place. */
export { FiltersPopover } from './cobranza-filters'

/**
 * Page-level report período selector in the PageHeader controls slot: a single
 * período dropdown (the prev/next stepper chevrons were removed — the dropdown
 * drives all period changes). The dropdown stays a full labelled Select on every
 * viewport (no below-desktop icon collapse) — on mobile and tablet it is a
 * labelled dropdown, not a calendar icon, mirroring MonthSelector in Operación
 * mensual. KPI deltas always compare against the previous period (no toggle), so
 * there is no compare control here. The pending Exportar action is supplied by the
 * page as a PageHeader action descriptor (disabled — no export mechanism exists
 * yet, surfaced as a clear pending state, not a faked download).
 */
export function ReportsPeriodControls({
  selectedPeriod,
  periods,
  onSelectPeriod,
}: {
  selectedPeriod: ReportPeriod
  /** Derived per render, never a module constant — see `lib/periods.ts`. */
  periods: ReportPeriod[]
  onSelectPeriod: (period: ReportPeriod) => void
}) {
  return (
    <Select value={selectedPeriod} onValueChange={(value) => onSelectPeriod(value as ReportPeriod)}>
      <SelectTrigger aria-label="Seleccionar período">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {periods.map((period) => (
          <SelectItem key={period} value={period}>
            {formatMonthYear(period)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
