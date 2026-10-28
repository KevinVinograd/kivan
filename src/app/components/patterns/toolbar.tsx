import { type ReactNode } from 'react'

import { Input } from '@/app/components/components'

/** The search field. Omit the whole object for a toolbar with no search. */
export type ToolbarSearch = {
  value: string
  onChange: (value: string) => void
  /** Placeholder text. Also the accessible name unless `label` overrides it. */
  placeholder: string
  /** Accessible name, when it should read differently from the placeholder. */
  label?: string
}

export type ToolbarProps = {
  /** Leading search field. */
  search?: ToolbarSearch
  /** The filter affordance — a `FilterPopover` / `FiltersPopover`. Sits beside the search. */
  filters?: ReactNode
  /** Controls pinned to the TRAILING edge: a columns menu, a primary action. */
  trailing?: ReactNode
  /**
   * A second row under the controls — a bulk-selection bar. Pass the component and let it
   * render `null` when nothing is selected; the row then collapses on its own.
   */
  bulk?: ReactNode
}

/**
 * Toolbar — the control row above a table or list: search, filters, trailing controls, and
 * an optional second row for a bulk-selection bar.
 *
 * It exists because this row was hand-rolled in eleven pages, all copying the same shape and
 * the same bug. The copied container was `flex flex-wrap` and the copied search was
 * `w-full shrink-0 sm:w-72`: below `sm` the search resolves to the full container width and
 * refuses to shrink, so `flex-wrap` pushed the filter button onto a SECOND ROW on every
 * phone. Here the search is `min-w-0 flex-1` on a phone (it takes the room that is left) and
 * pins to 288px from `sm` up, and the row never wraps — one row at every width.
 *
 * Breakpoints:
 * - **phone** (<640): `[ search ────────── ] [filter] [trailing]` — search flexes, the
 *   controls hold their size (`shrink-0`), one row.
 * - **`sm`+** (≥640): the search pins to 288px (`sm:w-72 sm:flex-none`) and the trailing
 *   group is pushed to the far edge by `ml-auto`.
 *
 * The controls inside the slots own their own responsive behaviour — a `FilterPopover` and a
 * columns menu already collapse to an icon-only button below `lg`. This component owns the
 * ROW, never the controls in it.
 */
export function Toolbar({ search, filters, trailing, bulk }: ToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {search ? (
          <Input
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            placeholder={search.placeholder}
            aria-label={search.label ?? search.placeholder}
            // `min-w-0 flex-1` so the field always yields the room the controls need instead
            // of claiming the whole line and wrapping them away; `sm:max-w-72` caps it at
            // 288px once there is room, so it stops growing with the viewport.
            //
            // The cap is a MAX, never a fixed width: `sm:` is a VIEWPORT query, but a Toolbar
            // can sit in a container far narrower than the viewport (a Sheet, a master-detail
            // panel). Pinning the field to a rigid 288px in a row that can never wrap would
            // overflow such a container the moment the window crossed 640px, with no escape —
            // the hand-rolled rows had `flex-wrap` as their release valve and this pattern
            // deliberately does not. A max-width keeps the same rendering everywhere it fits
            // and simply gives way where it does not.
            className="min-w-0 flex-1 sm:max-w-72"
          />
        ) : null}
        {filters}
        {/* `shrink-0` so the trailing controls keep their size and the search absorbs the
            squeeze; `ml-auto` pins them to the far edge once the search stops flexing. */}
        {trailing ? <div className="ml-auto flex shrink-0 items-center gap-2">{trailing}</div> : null}
      </div>
      {bulk}
    </div>
  )
}
