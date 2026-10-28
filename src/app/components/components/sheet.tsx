import * as React from "react"
import { X as XIcon } from "@phosphor-icons/react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@/app/lib/utils"
import { useIsBelowDesktop } from "@/app/lib/use-is-mobile"

/**
 * Sheet — shadcn/ui (new-york) Radix dialog rendered as an edge-anchored drawer,
 * token-adapted. The backdrop uses the `bg-overlay-default` scrim plus a
 * `backdrop-grayscale` tint so the content behind a sheet loses its color and
 * recedes (the open drawer is the focus). The panel uses the modal background
 * family (`bg-surface-recessed` + `shadow-raised`) composed inline rather than the
 * `surface-modal` recipe, so each `side` rounds only the edges that face into the
 * viewport: `bottom`/`top` sheets round their inner edge (`rounded-t/b-layout`),
 * and the `left` drawer is edge-flush on mobile but, on desktop (`md`+), detaches
 * into a floating panel — inset 8px on every side, full `rounded-layout` (the modal
 * radius), and a hairline on all four edges.
 * Titles map to `type-heading`, descriptions to `type-body-2 fg-subtle`. Theme is
 * handled by the tokens (no `dark:` overrides).
 *
 * Responsive, `side="right"` (the record/entity drawer): the panel scales with the
 * room available, and BELOW desktop (<1024px via `useIsBelowDesktop`) it docks to
 * the bottom edge as a slide-up sheet instead — a right drawer is a sliver on a
 * phone or tablet. From 1024px it is the floating right drawer at HALF the viewport
 * (a third leaves an entity column too narrow to read at laptop widths), narrowing
 * back to a third from `desktop:` (1440px) up, where half would overwhelm the page
 * behind it. This is the primitive's own behavior — inherited by every `side="right"`
 * consumer with NO call-site override — mirroring `Dialog`, which docks to a bottom
 * sheet on mobile the same way. It replaces the old `w-3/4 sm:max-w-sm` (384px) cap,
 * which no consumer wanted: the one drawer that shipped against it (`ActivityDrawer`)
 * had to fight it off with `sm:max-w-none`.
 */
function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(function SheetOverlay({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Overlay
      ref={ref}
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-overlay-default backdrop-blur-[var(--overlay-blur)] backdrop-grayscale data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  )
})

/** The bottom-docked slide-up sheet — the shape `side="bottom"` always takes, and the
 *  shape `side="right"` resolves to below desktop. Rounds only the edge that faces
 *  into the viewport, so an edge-flush sheet never rounds all four corners. */
const BOTTOM_SHEET_CLASS =
  "inset-x-0 bottom-0 h-[90dvh] rounded-t-layout border-t border-alpha-subtle data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  // Below desktop the right drawer would be a sliver, so it resolves to the bottom
  // sheet instead — the same shape `side="bottom"` renders, so the two agree by
  // construction. The consumer states its INTENT ("a right drawer") and the primitive
  // owns how that intent renders at each width; no call-site branching.
  const isBelowDesktop = useIsBelowDesktop()
  const rightIsBottomSheet = side === "right" && isBelowDesktop
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={rightIsBottomSheet ? "bottom" : side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-surface-recessed shadow-raised transition ease-[var(--motion-ease-in-out)] data-[state=closed]:animate-out data-[state=closed]:duration-[var(--motion-duration-panel)] data-[state=open]:animate-in data-[state=open]:duration-[var(--motion-duration-panel)]",
          // The right drawer: a bottom sheet below desktop; above it, a floating panel
          // (8px inset all sides, modal radius, full hairline) sized to the room
          // available — half the viewport at laptop widths, a third from 1440px up.
          rightIsBottomSheet && BOTTOM_SHEET_CLASS,
          side === "right" &&
            !isBelowDesktop &&
            "inset-y-2 right-2 h-auto w-1/2 rounded-layout border border-alpha-subtle data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right desktop:w-1/3",
          // The left drawer keeps the original edge-flush-then-floating treatment, and
          // deliberately floats from a DIFFERENT breakpoint than the right one (`md`,
          // 768px, vs the right drawer's 1024px): its only role is persistent navigation
          // chrome, never a record detail, and a nav rail already fits beside the page at
          // tablet width — whereas a record detail there is a sliver. Same gesture, two
          // thresholds, on purpose.
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 border-r border-alpha-subtle data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm md:inset-y-2 md:left-2 md:h-auto md:rounded-layout md:border",
          // top/bottom sheets round only the inner edge that faces the viewport.
          side === "top" &&
            "inset-x-0 top-0 h-auto rounded-b-layout border-b border-alpha-subtle data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
          side === "bottom" && BOTTOM_SHEET_CLASS,
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className="absolute top-4 right-4 rounded-control opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-hidden disabled:pointer-events-none data-[state=open]:bg-alpha-subtle [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("type-headline fg-default", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("type-body-2 fg-subtle", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
