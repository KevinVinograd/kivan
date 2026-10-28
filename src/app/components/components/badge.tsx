import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/app/lib/utils"

/**
 * Badge — shadcn/ui (new-york) base adapted to the token system. A compact,
 * non-interactive status pill. Dimensions (12px text / 4px inline padding /
 * 2px radius) come from the `status-chrome` token utility; color comes from a
 * semantic family pair, theme-aware via the underlying tokens. The shadcn
 * `asChild` / Radix `Slot` polymorphism is intentionally omitted — no consumer
 * needs a link-styled badge yet; reintroduce it via the adoption pipeline if a
 * need appears. For interactive affordances use `Button` / `IconButton`.
 *
 * `highContrast` toggles the emphasis of a tonal variant: off (the default) is
 * the quiet subtle-tinted look; on swaps to a loud, theme-independent deep fill
 * for states that must grab attention (e.g. a "Riesgo alto" risk band). Both come
 * from the pill's own `status-{tone}-{tier}` tokens (semantics-status.css), not
 * the shared semantic families. Use it sparingly — most pills should stay quiet.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 py-0 whitespace-nowrap status-chrome [&>svg]:size-3 [&>svg]:pointer-events-none",
  {
    variants: {
      // The tonal variants (neutral/success/warning/danger) carry NO color here —
      // their fill/text is resolved by the `variant × highContrast` compound
      // variants below, which apply a single component-scoped `status-{tone}-{tier}`
      // utility (one bg + one fg, from src/styles/semantics-status.css) so the pill
      // owns its colour independently of the shared semantic tokens (buttons/alerts).
      // `outline`/`primary` are not tonal and set their own color directly —
      // `highContrast` is a no-op on them.
      variant: {
        neutral: "",
        success: "",
        warning: "",
        danger: "",
        outline: "border border-alpha-subtle fg-default",
        primary: "bg-primary-default fg-reverse",
      },
      // Off (default) = low-emphasis resting look; on = high-contrast attention
      // fill. Real classes live in `compoundVariants`.
      highContrast: {
        false: "",
        true: "",
      },
      shape: {
        default: "",
        pill: "rounded-full",
      },
    },
    compoundVariants: [
      // ── highContrast OFF — quiet subtle look (tinted fill + themed text; the
      // dark fill is a muted color-mix wash below the ramp so it recedes) ──
      { variant: "neutral", highContrast: false, class: "status-neutral-subtle" },
      { variant: "success", highContrast: false, class: "status-success-subtle" },
      { variant: "warning", highContrast: false, class: "status-warning-subtle" },
      { variant: "danger", highContrast: false, class: "status-danger-subtle" },
      // ── highContrast ON — theme-independent deep fill + fixed text (white;
      // `warning` uses dark ink, its lighter fill being unfit for white) ──
      { variant: "neutral", highContrast: true, class: "status-neutral-emphasis" },
      { variant: "success", highContrast: true, class: "status-success-emphasis" },
      { variant: "warning", highContrast: true, class: "status-warning-emphasis" },
      { variant: "danger", highContrast: true, class: "status-danger-emphasis" },
    ],
    defaultVariants: {
      variant: "neutral",
      highContrast: false,
      shape: "pill",
    },
  },
)

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>
export type BadgeShape = NonNullable<VariantProps<typeof badgeVariants>["shape"]>

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {
  /**
   * Opt-in single-line ellipsis truncation for chips inside width-constrained
   * flex containers (e.g. reason chips in a narrow dashboard column). When
   * `true` the badge neutralizes its intrinsic `w-fit` / `shrink-0` sizing so it
   * can shrink below its content and ellipsize on one line; when `children` is a
   * plain string, a `title` fallback exposes the full label on hover / to
   * assistive tech. Off by default — the resting badge stays intrinsically sized
   * and never clips.
   */
  truncate?: boolean
}

/**
 * `variant` selects the background tone: `neutral` (default) for generic labels
 * (the sanctioned accent-gray neutral-status fill, `bg-accent-gray-subtle`),
 * `success` / `warning` / `danger` for status, `outline` for a low-emphasis
 * bordered chip, and `primary` for a high-emphasis solid chip (`bg-primary` with
 * `fg-reverse` text — e.g. an active-filter count).
 *
 * `highContrast` (default `false`) escalates a tonal variant from its quiet
 * subtle-tinted look to a loud, theme-independent deep fill with white text (dark
 * ink for `warning`, whose fill is too light for white). It is a no-op on
 * `outline` (no fill) and `primary` (already solid emphasis). Reach for it only on
 * the few states that must grab attention.
 *
 * `shape="pill"` makes it fully rounded (used for tag-style chips). Status
 * mapping (e.g. payment state) is the consumer's job.
 *
 * `truncate` (default `false`) opts a chip into single-line ellipsis truncation
 * for width-constrained containers; it neutralizes the intrinsic `w-fit` /
 * `shrink-0` sizing and adds a `title` fallback when `children` is a string.
 */
export function Badge({
  className,
  variant,
  shape,
  highContrast,
  truncate = false,
  title,
  children,
  ...props
}: BadgeProps) {
  // When truncating, expose the full label via `title` for hover / a11y — but
  // only when it is a plain string (a non-string child has no textual title).
  const resolvedTitle = title ?? (truncate && typeof children === "string" ? children : undefined)
  return (
    <span
      data-slot="badge"
      data-variant={variant ?? "neutral"}
      data-high-contrast={highContrast ? "" : undefined}
      title={resolvedTitle}
      className={cn(
        badgeVariants({ variant, shape, highContrast }),
        // Neutralize intrinsic sizing (`w-fit` → `w-auto`, `shrink-0` → `shrink`) so
        // the chip can shrink below its content inside a flex parent. The label
        // truncates in the inner span below (a flex item, so `truncate` gets a block
        // context and renders a real ellipsis anchored to the START — the base
        // `justify-center` would otherwise clip a centered label on both ends).
        truncate && "w-auto shrink min-w-0 max-w-full",
        className,
      )}
      {...props}
    >
      {truncate ? <span className="min-w-0 truncate">{children}</span> : children}
    </span>
  )
}

export { badgeVariants }
