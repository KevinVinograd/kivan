import type { ReactNode } from 'react'

import { cn } from '@/app/lib/utils'

const GAUGE_PATH = 'M 10 60 A 50 50 0 0 1 110 60'
const GAUGE_ARC_LENGTH = Math.PI * 50

export type ArcGaugeProps = {
  percent: number
  valueClassName: string
  ariaLabel: string
  value?: ReactNode
  label?: ReactNode
  className?: string
}

export function ArcGauge({ percent, valueClassName, ariaLabel, value, label, className }: ArcGaugeProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  const valueLength = (clamped / 100) * GAUGE_ARC_LENGTH
  return (
    <div className={cn('relative w-40', className)}>
      <svg viewBox="0 0 120 70" className="block w-full" role="img" aria-label={ariaLabel}>
        <path
          d={GAUGE_PATH}
          fill="none"
          stroke="var(--color-bg-accent-gray-subtle)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <path
          d={GAUGE_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${valueLength} ${GAUGE_ARC_LENGTH}`}
          className={valueClassName}
        />
      </svg>
      <div aria-hidden className="bg-texture-noise-gauge pointer-events-none absolute inset-0" />
      <div className="absolute inset-x-0 top-[52%] flex flex-col items-center">
        <span className="type-section fg-default tabular-nums">{value ?? `${clamped}%`}</span>
        {label ? <span className="type-caption fg-subtle">{label}</span> : null}
      </div>
    </div>
  )
}
