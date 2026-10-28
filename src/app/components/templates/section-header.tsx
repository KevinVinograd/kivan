import { useContext, type ReactNode } from 'react'

import { cn } from '@/app/lib/utils'
import {
  PanelInlineBreakpointContext,
  PanelPositionContext,
  type PanelInlineBreakpoint,
  type PanelPosition,
} from './panel'

export type SectionHeaderVariant = 'default' | 'control'

export type SectionHeaderProps = {
  title: string
  description?: string
  /**
   * A Breadcrumb trail rendered above the title (overline slot), for a panel
   * reached from a parent context the user may want to step back to. Default off
   * so existing section headers are unchanged. `default` variant only.
   */
  breadcrumb?: ReactNode
  /** Leading slot before the title column (icon, avatar, control). */
  leading?: ReactNode
  /** Inline slot immediately after the title text (count, info icon, status). */
  titleTrailing?: ReactNode
  actions?: ReactNode
  /**
   * Keep `actions` on the title row (right-aligned) at every width. This is the
   * default: a section's trailing action stays trailing on mobile instead of
   * wrapping below the title. The title column shrinks and truncates so a long
   * title yields to the action rather than pushing it off-screen. Set `false`
   * to opt back into the stacked-on-mobile layout (`flex-col` → `sm:flex-row`)
   * for the rare wide-action header (multiple buttons, or a control + button)
   * that would crowd a phone row. For a single long CTA prefer a responsive
   * label (short below `sm`, full at `sm+`) over stacking. Applies to both
   * variants.
   */
  actionsInline?: boolean
  metadata?: ReactNode
  /**
   * `control` makes the `leading` slot the primary visual (e.g. a `Tabs` control
   * that switches the panel's content) and renders the title `sr-only`. The L2
   * analogue of `PageHeader variant="control"`:
   * the control replaces the visible heading while the title stays for assistive
   * tech. `default` is the standard titled section header.
   */
  variant?: SectionHeaderVariant
  /**
   * Horizontal inset. `true` (default) keeps the owned 40px L/R padding so the
   * header aligns with inset page content. `false` drops it to 0 (flush) for the
   * card-title case — a SectionHeader sitting directly above a `Card` that is
   * itself flush in its container, so the title aligns with the card's left edge
   * instead of being indented past it. The vertical padding is unchanged.
   */
  inset?: boolean
}

// Inset padding mirrors PanelContent's so the header aligns with the panel body
// below it: shaded by the panel's position in its PanelGroup (PanelPositionContext)
// AND by the breakpoint at which that group actually becomes a row
// (PanelInlineBreakpointContext). The outer page gutter is responsive: 16px (px-4)
// below md, 24px (px-6) at md (tablet), 32px (px-8) at lg (laptop), 40px (px-10) at
// desktop (>=1440). While the group is still stacked every position takes the full
// page gutter on both faces (a stacked panel is never asymmetrically inset); only
// once the row exists do outer faces ramp 32px->40px and inner faces hold 20px
// (px-5). An `xl` group is stacked through the whole lg band, so its shading waits
// for xl — keying the table by breakpoint is what keeps a stacked aside from sitting
// 12px left of the column above it. The values are repeated locally (not shared) per
// the design-system 1:1 policy.
const INSET: Record<PanelInlineBreakpoint, Record<PanelPosition, string>> = {
  lg: {
    only: 'px-4 md:px-6 lg:px-8 desktop:px-10',
    first: 'px-4 md:px-6 lg:pl-8 lg:pr-5 desktop:pl-10',
    middle: 'px-4 md:px-6 lg:px-5',
    last: 'px-4 md:px-6 lg:pl-5 lg:pr-8 desktop:pr-10',
  },
  xl: {
    only: 'px-4 md:px-6 lg:px-8 desktop:px-10',
    first: 'px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10',
    middle: 'px-4 md:px-6 lg:px-8 xl:px-5',
    last: 'px-4 md:px-6 lg:px-8 xl:pl-5 desktop:pr-10',
  },
}

/**
 * L2 section header. Lives inside a Panel to give local context (title plus
 * optional leading slot, inline title-trailing slot, description, actions,
 * metadata). Actions affect only the panel or section they live in. Owns its
 * own internal padding. Do not use it to repeat the PageHeader title.
 *
 * `variant="control"` swaps the visible title for the `leading` control (the
 * panel-level navigation case) while keeping the title `sr-only`.
 */
export function SectionHeader({
  title,
  description,
  breadcrumb,
  leading,
  titleTrailing,
  actions,
  metadata,
  variant = 'default',
  inset = true,
  actionsInline = true,
}: SectionHeaderProps) {
  const position = useContext(PanelPositionContext)
  const inlineBreakpoint = useContext(PanelInlineBreakpointContext)
  const rootClass = cn('flex flex-col gap-3 py-3', inset ? INSET[inlineBreakpoint][position] : 'px-0')
  // actionsInline (default) keeps the title/actions row horizontal at every
  // width with the action right-aligned; the title column shrinks/truncates to
  // make room. actionsInline={false} opts back into the flex-col → sm:flex-row
  // stack (action wraps below the title on mobile) for wide-action headers.
  const headerRowClass = cn(
    'flex gap-2',
    actionsInline
      ? 'flex-row items-center justify-between'
      : 'flex-col sm:flex-row sm:items-center sm:justify-between',
  )
  if (variant === 'control') {
    return (
      <div className={rootClass}>
        <div className={headerRowClass}>
          {/* min-w-0 lets the leading control shrink below its content width so a
              wide control (e.g. a tab strip) can host its own horizontal scroll
              instead of overflowing the header. */}
          <div className="flex min-w-0 items-center gap-4">
            <h2 className="sr-only">{title}</h2>
            {leading}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>
          ) : null}
        </div>
        {metadata ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 type-caption fg-subtle">{metadata}</div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={rootClass}>
      <div className={headerRowClass}>
        {/* min-w-0 on the title side lets it shrink below its content width so a
            long title truncates (below) and the inline action keeps its size
            instead of being pushed off the row on a narrow phone. */}
        <div className="flex min-w-0 items-center gap-4">
          {leading ? <div className="flex shrink-0 items-center">{leading}</div> : null}
          <div className="flex min-w-0 flex-col gap-1">
            {breadcrumb}
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate type-section fg-default">{title}</h2>
              {titleTrailing ? (
                <span className="flex shrink-0 items-center">{titleTrailing}</span>
              ) : null}
            </div>
            {description ? <p className="type-body-2 fg-subtle">{description}</p> : null}
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0 sm:justify-end">{actions}</div>
        ) : null}
      </div>
      {metadata ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 type-caption fg-subtle">{metadata}</div>
      ) : null}
    </div>
  )
}
