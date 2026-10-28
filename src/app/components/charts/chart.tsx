import * as React from "react"
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  ReferenceLine,
} from "recharts"

import { cn } from "@/app/lib/utils"

/**
 * Chart — the governed Recharts chokepoint (chart-chrome primitive).
 *
 * This is the ONLY module in the app allowed to import from `recharts`. It
 * re-exports the curated set of Recharts primitives the product uses and adds
 * two token-adapted helpers: `ChartContainer` (a responsive, accessible sizing
 * wrapper) and `ChartTooltipContent` (a token-styled tooltip surface). Feature
 * code composes these from `@/app/components/charts` instead of importing
 * `recharts` directly, so chart chrome (surface, tooltip, colors) stays
 * tokenized and theme-aware. Enforced by `chart-adoption-check.mjs`.
 *
 * Colors are supplied by consumers as data-viz token references
 * (`var(--color-data-*)`); this primitive owns no domain palette.
 *
 * Category: primitive (chart-chrome namespace).
 */

// Curated Recharts surface — consumers import these from the chart barrel,
// never from `recharts` directly.
export {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  ReferenceLine,
}

export type ChartContainerProps = {
  /** Accessible summary of what the chart conveys (renders as one labelled img). */
  ariaLabel: string
  /** Fixed chart height in px; width always fills the parent. */
  height?: number
  /** Layout-only classes for the wrapper (sizing / spacing). */
  className?: string
  /**
   * Grain overlay mode. `"ring"` clips the film grain to a donut band — the
   * consumer sets `--donut-grain-inner` / `--donut-grain-outer` via className
   * (`[--donut-grain-inner:NNpx]`) to mirror its `<Pie>` radii. `"none"` (default)
   * renders no overlay: bar / line charts have dynamic marks with no static mask,
   * so a full-bleed grain would bleed across the plot background.
   */
  grain?: "none" | "ring"
  /** A single Recharts chart element (ResponsiveContainer accepts one child). */
  children: React.ReactElement
}

/**
 * Responsive, accessible sizing wrapper around Recharts' ResponsiveContainer.
 * Exposes the chart to assistive tech as a single labelled image.
 */
export function ChartContainer({ ariaLabel, height = 200, className, grain = "none", children }: ChartContainerProps) {
  return (
    <div role="img" aria-label={ariaLabel} className={cn("relative w-full", className)}>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
      {/* Static grain overlay — only for donut charts (`grain="ring"`), where the
          shared film grain is clipped to the ring band (via `.bg-texture-noise-donut`
          in semantics-gradients.css) so it never bleeds onto the chart background.
          Bar / line charts pass the default `"none"` and render no overlay, since
          their dynamic marks admit no static mask. Same grain source as the
          `.bg-gradient-ai-insight` shader. aria-hidden + pointer-events-none so it
          never reaches assistive tech or intercepts hover/tooltip. */}
      {grain === "ring" ? (
        <div aria-hidden className="bg-texture-noise-donut pointer-events-none absolute inset-0" />
      ) : null}
    </div>
  )
}

/** One payload entry Recharts hands to a custom tooltip. */
export type ChartTooltipPayloadEntry = {
  name?: string | number
  value?: string | number
  color?: string
  payload?: Record<string, unknown>
}

export type ChartTooltipContentProps = {
  /** Injected by Recharts when the tooltip is active. */
  active?: boolean
  /** Injected by Recharts: the hovered series entries. */
  payload?: ChartTooltipPayloadEntry[]
  /** Injected by Recharts: the category label of the hovered point. */
  label?: string | number
  /** Formats each entry's numeric value into a display string. */
  formatValue?: (value: number, entry: ChartTooltipPayloadEntry) => string
  /** Hide the category-label row (e.g. for single-series pies). */
  hideLabel?: boolean
}

/**
 * Token-styled tooltip surface. Pass as `content` to the re-exported `Tooltip`;
 * Recharts injects `active` / `payload` / `label` at runtime.
 */
export function ChartTooltipContent({
  active,
  payload,
  label,
  formatValue,
  hideLabel = false,
}: ChartTooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="flex flex-col gap-0.5 surface-raised px-3 py-2">
      {!hideLabel && label != null ? (
        <span className="type-caption fg-subtle">{String(label)}</span>
      ) : null}
      {payload.map((entry, index) => (
        <span key={index} className="type-caption fg-default tabular-nums">
          {entry.name != null ? `${entry.name}: ` : ""}
          {formatValue ? formatValue(Number(entry.value), entry) : String(entry.value ?? "")}
        </span>
      ))}
    </div>
  )
}
