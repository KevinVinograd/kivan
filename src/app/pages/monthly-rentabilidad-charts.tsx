import { useState } from 'react'

import { cn } from '@/app/lib/utils'
import { ChartContainer, ChartTooltipContent, PieChart, Pie, Cell, Tooltip } from '@/app/components/charts'
import { formatCurrency, formatPercent } from './monthly-operation-format'

export type MarginTone = 'default' | 'warning' | 'danger'

const SLICE_FILL = {
  equipo: 'var(--color-data-blue)',
  producciones: 'var(--color-data-aqua)',
  gastos: 'var(--color-data-navy)',
  rentabilidad: 'var(--color-data-green)',
}

const MARGIN_FG: Record<MarginTone, string> = {
  default: 'fg-success',
  warning: 'fg-warning',
  danger: 'fg-danger',
}

const LEGEND_ITEMS = [
  { key: 'equipo', label: 'Equipo' },
  { key: 'producciones', label: 'Producciones' },
  { key: 'gastos', label: 'Gastos fijos' },
  { key: 'rentabilidad', label: 'Rentabilidad' },
] as const

export type CompositionDonutProps = {
  teamCost: number
  productionCost: number
  fixedExpenses: number
  profit: number
  margin: number
  marginTone: MarginTone
}

export function CompositionDonut({
  teamCost,
  productionCost,
  fixedExpenses,
  profit,
  margin,
  marginTone,
}: CompositionDonutProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const slices = [
    { key: 'equipo' as const, label: 'Equipo', value: teamCost },
    { key: 'producciones' as const, label: 'Producciones', value: productionCost },
    { key: 'gastos' as const, label: 'Gastos fijos', value: fixedExpenses },
    ...(profit > 0 ? [{ key: 'rentabilidad' as const, label: 'Rentabilidad', value: profit }] : []),
  ]
  const activeSlice = activeIndex !== null && activeIndex < slices.length ? activeIndex : null
  return (
    <div className="relative">
      <ChartContainer
        ariaLabel={`Composición de la rentabilidad. Margen estimado ${formatPercent(margin)}.`}
        height={208}
        grain="ring"
        className="[--donut-grain-inner:66px] [--donut-grain-outer:96px]"
      >
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius={66}
            outerRadius={96}
            paddingAngle={2}
            strokeWidth={0}
            startAngle={90}
            endAngle={-270}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            {slices.map((slice, index) => (
              <Cell
                key={slice.key}
                fill={SLICE_FILL[slice.key]}
                fillOpacity={activeSlice === null || activeSlice === index ? 1 : 0.4}
              />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltipContent hideLabel formatValue={(value) => formatCurrency(value)} />} />
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('type-headline tabular-nums', MARGIN_FG[marginTone])}>{formatPercent(margin)}</span>
        <span className="type-caption fg-subtle">Margen</span>
      </div>
    </div>
  )
}

export type CompositionLegendProps = {
  showProfit: boolean
}

export function CompositionLegend({ showProfit }: CompositionLegendProps) {
  const items = showProfit ? LEGEND_ITEMS : LEGEND_ITEMS.filter((item) => item.key !== 'rentabilidad')
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <span key={item.key} className="flex items-center gap-1 type-caption fg-default">
          <svg viewBox="0 0 8 8" aria-hidden className="size-2 shrink-0">
            <circle cx="4" cy="4" r="4" fill={SLICE_FILL[item.key]} />
          </svg>
          {item.label}
        </span>
      ))}
    </div>
  )
}
