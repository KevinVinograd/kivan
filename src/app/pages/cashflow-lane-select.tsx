import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/components'
import type { Currency } from './treasury-mock-data'
import { LANE_LABEL } from './treasury-position-view'

export function CashflowLaneSelect({
  lane,
  lanes,
  onChange,
}: {
  lane: Currency
  lanes: Currency[]
  onChange: (lane: Currency) => void
}) {
  if (lanes.length <= 1) return null
  return (
    <div className="flex items-center gap-2 px-4 md:px-6 lg:px-8 desktop:px-10">
      <span className="type-caption fg-subtle">Moneda</span>
      <Select value={lane} onValueChange={(value) => onChange(value as Currency)}>
        <SelectTrigger className="h-9 w-32" aria-label="Moneda de la proyección">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {lanes.map((currency) => (
            <SelectItem key={currency} value={currency}>
              {LANE_LABEL[currency]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
