import { ArcGauge } from '@/app/components/patterns'
import type { ProfitabilityStatus } from './clients-mock-data'
import { PROFITABILITY_GAUGE_FG } from './clients-format'

export type ProfitabilityGaugeProps = {
  percent: number
  status: ProfitabilityStatus
  label: string
}

export function ProfitabilityGauge({ percent, status, label }: ProfitabilityGaugeProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <ArcGauge
      percent={percent}
      valueClassName={PROFITABILITY_GAUGE_FG[status]}
      ariaLabel={`Rentabilidad ${clamped}%`}
      label={label}
    />
  )
}
