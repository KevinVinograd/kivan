import type { ReactNode } from 'react'

import { AFFORDANCE } from '@/app/lib/icon-registry'
import {
  Button,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/app/components/components'

const FilterIcon = AFFORDANCE.filter

export type FilterPopoverProps = {
  /**
   * Number of active filter axes. When > 0 the trigger shows a corner count
   * badge and reads as `selected`. Defaults to 0.
   */
  count?: number
  /** Panel heading and, by default, the icon trigger's accessible name. */
  title?: string
  /** Accessible name for the icon-only trigger when it should differ from `title`. */
  triggerLabel?: string
  /**
   * Resets the filters. When provided and `canClear` resolves truthy, a clear
   * action renders in the panel header.
   */
  onClear?: () => void
  /** Whether the clear action is offered. Defaults to `count > 0`. */
  canClear?: boolean
  /** Label for the clear action. */
  clearLabel?: string
  /** The filter fields shown inside the panel (an accordion or control groups). */
  children: ReactNode
}

/**
 * FilterPopover — the compact, icon-triggered filter control: a funnel
 * `IconButton` carrying an active-axis count badge that opens a `Popover` panel
 * (heading + optional clear action + the consumer's filter fields). It is the
 * canonical compact filter affordance for list/feed surfaces, e.g. the trailing
 * control beside a search field on mobile, replacing per-page hand-rolled
 * "Filtros" icon triggers.
 *
 * Domain-neutral about WHICH axes exist: the consumer passes the fields as
 * `children` and owns the filter state, the active `count`, and the reset
 * handler. Token-pure: composes the `IconButton` / `Popover` / `Button`
 * primitives; the count badge reuses the primary-emphasis token recipe (the
 * same 16x16 circle as the text-trigger `FilterCountIndicator`).
 */
export function FilterPopover({
  count = 0,
  title = 'Filtros',
  triggerLabel,
  onClear,
  canClear,
  clearLabel = 'Limpiar',
  children,
}: FilterPopoverProps) {
  const active = count > 0
  const showClear = onClear != null && (canClear ?? active)
  return (
    <Popover>
      {/* Relative anchor so the count badge pins to the trigger's corner. The
          `pt-1` reserves the badge's 4px upward overflow INSIDE this box, so the
          badge never paints above the anchor — otherwise it is clipped when the
          control sits flush at the top of an `overflow-y-auto` list (the mobile
          search row inside `PanelContent`). The badge still floats at the
          button's outer corner; only the anchor box grew upward. */}
      <span className="relative inline-flex pt-1">
        <PopoverTrigger asChild>
          <IconButton
            aria-label={triggerLabel ?? title}
            variant="outlined"
            color="primary"
            size="default"
            selected={active}
          >
            <FilterIcon className="size-5" aria-hidden />
          </IconButton>
        </PopoverTrigger>
        {active ? (
          // raw ok — the active-axis count badge: a fixed 16x16 primary-emphasis
          // circle. Mirrors the page-level `FilterCountIndicator`, which this
          // pattern cannot import (a pattern must not depend on `app/pages`).
          // `top-0` (not `-top-1`) keeps it inside the `pt-1` anchor, hence
          // clip-safe, while still rendering at the button's top-right corner.
          <span className="pointer-events-none absolute top-0 -right-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-default type-caption tabular-nums fg-reverse">
            {count}
          </span>
        ) : null}
      </span>
      <PopoverContent align="end" className="flex w-72 flex-col gap-2">
        <div className="flex items-center justify-between px-2 pt-2">
          <span className="type-body-2 font-semibold fg-subtle">{title}</span>
          {showClear ? (
            <Button variant="transparent" color="primary" size="dense" onClick={onClear}>
              {clearLabel}
            </Button>
          ) : null}
        </div>
        {children}
      </PopoverContent>
    </Popover>
  )
}
