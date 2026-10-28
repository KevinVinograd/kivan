import * as React from "react"

import { useScrollMask } from "@/app/lib/use-scroll-mask"
import { cn } from "@/app/lib/utils"

/**
 * Table — shadcn/ui (new-york) base adapted to the token system. Eight slot
 * components (`Table` + header/body/footer/row/head/cell/caption) compose a
 * semantic HTML `<table>`. Pure presentation: it owns no sorting, selection, or
 * pagination — pair it with `@tanstack/react-table` headless state in the
 * consumer. Every color/typography value resolves to a semantic token from
 * `/src/styles/` (theme-aware), never a raw Tailwind palette class.
 */

function Table({
  className,
  maskTrailingEdge = true,
  ...props
}: React.ComponentProps<"table"> & {
  /**
   * Fade the trailing (right) edge while the grid overflows. Set `false` when the
   * consumer pins an opaque control column to that edge (DataTable's
   * `pinActionsColumn`): the container mask fades EVERY descendant at the edge it
   * engages, sticky cells included, so the pinned `⋯` trigger would go washed out
   * while staying clickable. Those grids cue the trailing edge with the pinned
   * cell's own `pinned-actions-fade` band instead.
   */
  maskTrailingEdge?: boolean
}) {
  // The overflow cue is an alpha mask on the scroll container: the data itself
  // dissolves at an engaged edge instead of being hard-cut in front of a painted
  // shadow, so the edge reads as "the row continues". It cues at rest (not only
  // mid-scroll) — which matters on iOS/Safari, where overlay scrollbars auto-hide
  // — and, unlike a background cover, it needs no knowledge of the surface behind
  // the table, so it is correct on a page and inside a Card alike. The 24px band
  // matches the pinned column's `pinned-actions-fade`.
  const containerRef = React.useRef<HTMLDivElement>(null)
  const maskClass = useScrollMask(
    containerRef,
    true,
    24,
    maskTrailingEdge ? "both" : "leading",
  )

  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", maskClass)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom type-body-2", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-alpha-subtle", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  // Body rows are borderless by design — only the header row carries a divider
  // (see TableRow / TableHeader). This is the standing rule for every table.
  return <tbody data-slot="table-body" className={cn(className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-alpha-subtle bg-alpha-subtle font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  )
}

function TableRow({
  className,
  interactive = false,
  ...props
}: React.ComponentProps<"tr"> & {
  /**
   * Marks the row as clickable (opens a detail/master-detail). Adds
   * `cursor-pointer` only — tables are reading surfaces, so a row NEVER moves:
   * no transform, scale, shadow, or magnetic. Feedback is the token hover/active
   * fill + the persistent `data-[state=selected]` fill. See `lib/motion.ts`.
   */
  interactive?: boolean
}) {
  // No row divider: only the header row (TableHeader) carries a bottom border.
  // Body rows separate by spacing + hover/selected fills, never a hairline.
  // Motion is `standard` (color/fill transition only) by hard rule — see the
  // prop note above.
  return (
    <tr
      data-slot="table-row"
      data-interactive={interactive ? "true" : undefined}
      className={cn(
        "motion-standard hover:bg-alpha-subtle-hover has-aria-expanded:bg-alpha-subtle-hover data-[state=selected]:bg-alpha-subtle-active",
        interactive && "cursor-pointer",
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap fg-default [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 fg-subtle", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
