import type { ReactNode } from 'react'

import { cn } from '@/app/lib/utils'

// Semicircle arc: center (60,60), r=50, swept left→right over the top. The value
// arc fills from the left as the percentage grows (strokeDasharray on the path).
const GAUGE_PATH = 'M 10 60 A 50 50 0 0 1 110 60'
const GAUGE_ARC_LENGTH = Math.PI * 50

export type ArcGaugeProps = {
  /** Fill percentage, 0–100 (clamped). */
  percent: number
  /**
   * Token class that colors the value arc through `stroke="currentColor"`. MUST be
   * a data-viz foreground token (`fg-data-*`, chart-specific + theme-independent),
   * never a raw color.
   */
  valueClassName: string
  /** Accessible label for the gauge (role="img"); states the metric + value. */
  ariaLabel: string
  /** Center figure (defaults to the rounded percentage). */
  value?: ReactNode
  /** Short caption under the value (e.g. a tier or account label). */
  label?: ReactNode
  /** Layout override for the outer wrapper (width). Defaults to `w-40`. */
  className?: string
}

/**
 * Token-pure semicircle gauge. A two-path SVG arc (subtle track + tone-colored
 * value) with no charting dependency: the value arc is colored through the
 * data-viz token family via `stroke="currentColor"` + the consumer's `fg-data-*`
 * class; the background track strokes the subtle gray accent token. The center
 * shows a value figure + optional caption. Layout/structure use plain Tailwind
 * utilities only.
 *
 * The single sanctioned gauge framing — consumers map their own status/tone to an
 * `fg-data-*` class and pass a value + label, instead of hand-rolling the arc.
 * Consumed by the Clients detail (profitability) and the Facturación monotributos
 * panel (usage).
 */
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
      {/* Static grain overlay: the shared grain the charts + AiInsight shader use,
          masked to the arc band so it paints only over the gauge stroke. aria-hidden
          + pointer-events-none; the labels stay crisp above it. */}
      <div aria-hidden className="bg-texture-noise-gauge pointer-events-none absolute inset-0" />
      <div className="absolute inset-x-0 top-[52%] flex flex-col items-center">
        <span className="type-section fg-default tabular-nums">{value ?? `${clamped}%`}</span>
        {label ? <span className="type-caption fg-subtle">{label}</span> : null}
      </div>
    </div>
  )
}
