import { cn } from '@/app/lib/utils'

/**
 * Admin / Operations Dashboard — shared leaf primitive.
 *
 * A single label + value stack reused by the section metric strips (§3–§8). It is
 * a pure layout leaf (no Card, no header), so it does not abstract any design
 * system component — it only spares the sections from repeating the same caption
 * + figure markup. Color comes from a semantic `fg-*` token passed by the caller.
 */
export function MetricTile({
  label,
  value,
  tone = 'fg-default',
  size = 'compact',
}: {
  label: string
  value: string
  tone?: string
  /**
   * 'kpi' = the 32px supporting-KPI figure (`type-metric-2`) for a summary card's
   * grid directly below the one `type-metric` hero. 'compact' (default) = 20px
   * (`type-section`) for hero-less grids, so they do not become a flat all-32px
   * grid with no primary.
   */
  size?: 'kpi' | 'compact'
}) {
  // Non-numeric empty states (e.g. "No disponible") are not KPI figures — keep them
  // at the smaller size and muted so they do not overflow the tile at 32px.
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
