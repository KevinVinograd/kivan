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
  ariaLabel: string
  height?: number
  className?: string
  grain?: "none" | "ring"
  children: React.ReactElement
}

export function ChartContainer({ ariaLabel, height = 200, className, grain = "none", children }: ChartContainerProps) {
  return (
    <div role="img" aria-label={ariaLabel} className={cn("relative w-full", className)}>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
      {grain === "ring" ? (
        <div aria-hidden className="bg-texture-noise-donut pointer-events-none absolute inset-0" />
      ) : null}
    </div>
  )
}

export type ChartTooltipPayloadEntry = {
  name?: string | number
  value?: string | number
  color?: string
  payload?: Record<string, unknown>
}

export type ChartTooltipContentProps = {
  active?: boolean
  payload?: ChartTooltipPayloadEntry[]
  label?: string | number
  formatValue?: (value: number, entry: ChartTooltipPayloadEntry) => string
  hideLabel?: boolean
}

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
