import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/components'
import { formatMonthYear } from './reports-format'
import { type ReportPeriod } from './reports-periods'

export { FiltersPopover } from './cobranza-filters'

export function ReportsPeriodControls({
  selectedPeriod,
  periods,
  onSelectPeriod,
}: {
  selectedPeriod: ReportPeriod
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
