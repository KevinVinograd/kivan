import { cn } from '@/app/lib/utils'

export function MetricTile({
  label,
  value,
  tone = 'fg-default',
  size = 'compact',
}: {
  label: string
  value: string
  tone?: string
  size?: 'kpi' | 'compact'
}) {
  const isFigure = /\d/.test(value)
  const valueClass = size === 'kpi' && isFigure ? 'type-metric-2' : 'type-section'
  const valueTone = size === 'kpi' && !isFigure ? 'fg-subtle' : tone
  return (
    <div className="flex flex-col gap-1">
      <span className="type-caption fg-subtle">{label}</span>
      <span className={cn(valueClass, 'tabular-nums', valueTone)}>{value}</span>
    </div>
  )
}
