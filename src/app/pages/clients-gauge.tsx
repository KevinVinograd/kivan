import { ArcGauge } from '@/app/components/patterns'
import type { ProfitabilityStatus } from './clients-mock-data'
import { PROFITABILITY_GAUGE_FG } from './clients-format'

export type ProfitabilityGaugeProps = {
  percent: number
  status: ProfitabilityStatus
  /** Short tier label rendered under the value (e.g. "Alta"). */
  label: string
}

/**
 * Profitability gauge for the Clients detail — a thin wrapper over the governed
 * `ArcGauge` pattern that maps the profitability status to its data-viz token
 * (`PROFITABILITY_GAUGE_FG`). The arc geometry, track, grain and centered value
 * live in `ArcGauge`; this file owns only the profitability-specific mapping.
 */
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
