import * as React from "react"

import { cn } from "@/app/lib/utils"
import { motionClass, MOTION_MAGNETIC_CARD, type MotionPreset } from "@/app/lib/motion"

/**
 * Card — shadcn/ui (new-york) base adapted to the token system. A non-interactive
 * content container that segments related information into a soft surface. The
 * chrome maps to the shared `surface-subtle` recipe (`bg-surface-flat` + container
 * radius + soft shadow) plus a `border-alpha-subtle` hairline for crisper
 * segmentation. Seven slots compose the card; `CardDescription` →
 * `type-body-2 fg-subtle`, `CardTitle` keeps `font-semibold`. Theme is handled by
 * the tokens (no `dark:` overrides).
 */
/**
 * Surface recipe per variant. `default` is the soft `surface-subtle` (flat bg +
 * container radius + soft shadow); `outlined` drops the shadow — a flat surface
 * with the hairline border only (bg-surface-flat + container radius); `ghost`
 * goes further with a transparent fill (hairline border only, blends into the
 * panel). All three keep the `border-alpha-subtle` hairline.
 *
 * The opaque variants also claim `pin-surface-flat`, which republishes
 * `--pin-surface` as the card's own fill for its subtree. A horizontally-scrolling
 * table hosted inside the card (DataTable's `pinActionsColumn`) then pins its
 * actions column against the CARD; without it the pinned cell paints the page fill
 * and its leading band fades to the page color, punching a page-colored strip
 * through the card. `ghost` is transparent — whatever it sits on is already the
 * correct pin surface — so it must keep INHERITING and does not claim the override.
 */
const CARD_SURFACE = {
  default: "surface-subtle pin-surface-flat",
  outlined: "bg-surface-flat rounded-container pin-surface-flat",
  ghost: "bg-alpha-transparent rounded-container",
} as const

export type CardVariant = keyof typeof CARD_SURFACE

type CardProps = React.ComponentProps<"div"> & {
  variant?: CardVariant
  /**
   * Marks the card as a clickable/navigating surface: adds `cursor-pointer`, a
   * `focus-visible` ring, the resting hover affordance and interaction motion.
   * Leave off for purely informational cards (the default) — they get no motion.
   */
  interactive?: boolean
  /**
   * Marks an interactive card as the currently-selected one in a group (e.g. a
   * card acting as a tab / nav trigger). Applies the persistent selected chrome
   * (`border-alpha-subtle-active` + `bg-alpha-subtle-selected`) over the resting
   * surface; the resting hover affordance is suppressed while selected. Ignored
   * when `interactive` is false. The tokens use a `data-[selected=true]:`
   * selector so they outrank the base surface/border recipe regardless of
   * stylesheet order (Tailwind v4 cascade).
   */
  selected?: boolean
  /**
   * Motion preset. Defaults to `standard` when `interactive`, `none` otherwise.
   * Use `soft-magnetic` on a clearly clickable card for a subtle 4px hover lift
   * + press. Ignored visually when not interactive. See `lib/motion.ts`.
   */
  motion?: MotionPreset
  /**
   * Density. `default` is the 16px-inset card; `compact` tightens it to a uniform
   * 8px inset (`p-2` on the card, slot `px` zeroed so it does not stack) and drops
   * the radius from the container (16px) to the control (8px) tier — for dense,
   * leaf-level card groups such as the mobile KPI tab-card strips. The surface /
   * shadow / border recipe and all other props are unchanged. Defaults to
   * `default` → existing instances unaffected.
   */
  size?: "default" | "compact"
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = "default", size = "default", interactive = false, selected = false, motion, ...props },
  ref,
) {
  const resolvedMotion: MotionPreset = motion ?? (interactive ? "standard" : "none")
  return (
    <div
      ref={ref}
      data-slot="card"
      data-variant={variant}
      data-size={size === "compact" ? "compact" : undefined}
      data-interactive={interactive ? "true" : undefined}
      data-selected={interactive && selected ? "true" : undefined}
      className={cn(
        CARD_SURFACE[variant],
        "flex flex-col gap-6 border border-alpha-subtle fg-default",
        // Density. Default is the 16px inset (py-4 on the card + px-4 on the
        // slots). Compact tightens to a uniform 8px (p-2 on the card, slot px
        // zeroed so it does not stack) and drops the 16px container radius to the
        // 8px control radius — the `data-[size=compact]:` selector outranks the
        // surface recipe's radius regardless of stylesheet order (Tailwind v4).
        size === "compact"
          ? "p-2 data-[size=compact]:rounded-control [&_[data-slot=card-content]]:px-0 [&_[data-slot=card-header]]:px-0 [&_[data-slot=card-footer]]:px-0"
          : "py-4",
        interactive && "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-focus",
        interactive && !selected && "hover:border-alpha-subtle-hover hover:bg-alpha-subtle-hover",
        // Selected (shaded or flat) carries the active hairline border.
        interactive && selected && "data-[selected=true]:border-alpha-subtle-active",
        // Flat selected fill (a card group's active item; the lime KpiTabCard layers its
        // own unlayered wash on top of this).
        interactive && selected && "data-[selected=true]:bg-alpha-subtle-selected",
        motionClass(resolvedMotion),
        resolvedMotion === "soft-magnetic" && MOTION_MAGNETIC_CARD,
        className,
      )}
      {...props}
    />
  )
})

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("type-body-2 fg-subtle", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  )
}

type CardContentProps = React.ComponentProps<"div"> & {
  /**
   * Density of the DEFAULT content stack. Undefined = the responsive ramp: the
   * standard card content gap steps 8px (mobile) → 12px (laptop, `lg`) → 16px
   * (desktop, 1440px) — applied ONLY when the call site does not declare its own
   * layout (any `flex`/`grid`/`block` display or explicit `gap-*`; those own their
   * spacing untouched). The prop pins a flat tier for a standard stack: `dense` = 8px,
   * `comfortable`
   * = 16px, at every viewport.
   */
  density?: "comfortable" | "dense"
}

function CardContent({ className, density, ...props }: CardContentProps) {
  // A call site that declares its OWN layout — a flex/grid container, an explicit
  // gap, or an explicit display keyword (bespoke cards: hero labels `flex ... gap-1`,
  // risk cards `flex ... gap-3`, the connected activity timelines `flex flex-col`
  // with no gap, grid metric strips, etc.) — owns its spacing. CardContent then adds
  // NO flex/gap so those render identically (zero blast radius). A standard stack
  // with no layout classes gets the responsive density ramp by default; the
  // `density` prop pins a flat tier (and owns the flex column) at every viewport.
  const ownsLayout = (className ?? "").split(/\s+/).some(
    (token) =>
      token === "flex" ||
      token === "grid" ||
      token === "inline-flex" ||
      token === "inline-grid" ||
      token === "block" ||
      token === "inline-block" ||
      token === "inline" ||
      token === "table" ||
      token === "contents" ||
      token === "flow-root" ||
      /^gap(?:-x|-y)?-/.test(token),
  )
  const ownedGap =
    density === "dense"
      ? "flex flex-col gap-2"
      : density === "comfortable"
        ? "flex flex-col gap-4"
        : ownsLayout
          ? ""
          : "flex flex-col gap-2 lg:gap-3 desktop:gap-4"
  return (
    <div data-slot="card-content" className={cn("px-4", ownedGap, className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-4", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
