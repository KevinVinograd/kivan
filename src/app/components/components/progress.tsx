import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/app/lib/utils"

/**
 * Progress — shadcn/ui (new-york) Radix progress, token-adapted. A horizontal
 * determinate bar: a neutral `bg-alpha-subtle` track (the Radix `Root`, which
 * also supplies the `role="progressbar"` + value ARIA) with a token-colored
 * fill. The raw CLI output drove the fill with an inline `translateX` transform;
 * inline `style` is forbidden repo-wide (`react/forbid-dom-props`), so the fill
 * is drawn the way the codebase draws every dynamic visual — an SVG whose
 * geometry is a presentation attribute (the rect `width`) and whose color is
 * `fill="currentColor"` + a semantic `fg-*` tone class (same technique as
 * `ProfitabilityGauge`). The tone is selectable so a consumer can encode a band
 * (a workload bar that goes warning/danger as it fills) without overriding color.
 *
 * Determinate only — the indeterminate animation was not adopted (no consumer
 * needs it yet; reintroduce via the adoption pipeline if one appears).
 */
const INDICATOR_FG = {
  default: "fg-primary",
  success: "fg-success",
  warning: "fg-warning",
  danger: "fg-danger",
} as const

export type ProgressTone = keyof typeof INDICATOR_FG

export type ProgressProps = React.ComponentProps<typeof ProgressPrimitive.Root> & {
  /** Indicator fill tone. Defaults to `default` (the neutral brand solid). */
  tone?: ProgressTone
}

/**
 * `value` is the filled percentage (0–100); omit/`null` renders an empty track.
 * `tone` selects the indicator fill — `default` for a neutral bar, or
 * `success` / `warning` / `danger` to encode a band. The track is always the
 * neutral `bg-alpha-subtle`. Height/width are layout (`className`), not color.
 */
export function Progress({ className, value, tone = "default", ...props }: ProgressProps) {
  const filled = Math.max(0, Math.min(100, value ?? 0))
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-alpha-subtle",
        className,
      )}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator asChild>
        <svg
          data-slot="progress-indicator"
          data-tone={tone}
          className={cn("block h-full w-full", INDICATOR_FG[tone])}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {/* Animate the fill on value change instead of jumping. The width is a
              presentation attribute (no inline style, per react/forbid-dom-props);
              SVG2 geometry transitions animate it. Timing routes through the motion
              tokens; stripped under reduced motion. */}
          <rect
            x="0"
            y="0"
            height="100"
            width={filled}
            fill="currentColor"
            className="transition-[width] duration-[var(--motion-duration-quick)] ease-[var(--motion-ease-out)] motion-reduce:transition-none"
          />
        </svg>
      </ProgressPrimitive.Indicator>
    </ProgressPrimitive.Root>
  )
}
