import * as React from "react"
import { X as XIcon } from "@phosphor-icons/react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/app/lib/utils"
import { useIsMobile } from "@/app/lib/use-is-mobile"

/**
 * Dialog — shadcn/ui (new-york) Radix dialog, token-adapted. A blocking modal:
 * the backdrop uses the `bg-overlay-default` scrim and the panel uses the shared
 * `surface-modal` recipe (the token system's named target for "Modal, Dialog" —
 * `bg-surface-recessed` + `border-alpha-subtle` + layout radius + raised shadow).
 * Titles map to `type-heading`, descriptions to `type-body-2 fg-subtle`. The
 * source's baked-in `Button` close affordance in the footer was dropped (the
 * frozen custom Button has no `asChild`/`variant="outline"`); consumers compose
 * `<DialogClose asChild><Button … /></DialogClose>`. Theme is handled by the
 * tokens (no `dark:` overrides).
 *
 * Responsive: on mobile (≤767px via `useIsMobile`) the panel docks to the bottom
 * edge as a slide-up sheet — rounded top, a single top hairline, and a visual
 * grabber — instead of centering; at `md`+ the centered `surface-modal` chrome is
 * unchanged. The mobile chrome is composed inline (NOT the `surface-modal` recipe)
 * because an edge-flush sheet must not round all corners — mirroring the reasoning
 * in `Sheet` `side="bottom"`. This is inherited by every consumer of
 * `DialogContent` (including `CommandDialog`) with no call-site changes.
 */
function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      data-slot="dialog-overlay"
      className={cn(
        // Overlay fade timed by the motion token (160ms), sober. The scrim color
        // dims; the backdrop blur (overlay token) dissolves what is behind it; the
        // grayscale tint drains its color so the modal is the focus.
        "fixed inset-0 z-50 bg-overlay-default backdrop-blur-[var(--overlay-blur)] backdrop-grayscale duration-[var(--motion-duration-quick)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  )
})

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const isMobile = useIsMobile()
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-variant={isMobile ? "sheet" : "modal"}
        className={cn(
          // Shared chrome: grid body, capped height with internal scroll.
          "fixed z-50 grid w-full gap-4 overflow-y-auto p-6 outline-none",
          isMobile
            ? // Mobile: bottom-docked slide-up sheet. Chrome composed inline (not
              // `surface-modal`) so only the top corners round and only a top
              // hairline draws — an edge-flush sheet must not round all corners.
              // Slide timed by the panel motion token, mirroring `Sheet`
              // side="bottom"; bottom padding comes from the shared `p-6`.
              // The sheet is edge-flush at the bottom by design, so it keeps the
              // plain 90dvh cap — the bottom-gutter rule below applies to the
              // centered desktop modal, which is the one that can overflow.
              "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-layout border-t border-alpha-subtle bg-surface-recessed shadow-raised duration-[var(--motion-duration-panel)] data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom"
            : // Desktop: centered, top-anchored modal. Sober fade + 95% zoom, timed
              // by the modal motion token (260ms). See semantics-motion.css.
              //
              // MODAL BOTTOM GUTTER (rule, not a one-off). The height cap SUBTRACTS
              // the top offset twice, so the gap below the modal always equals the
              // gap above it and never falls under the clamp's 40px floor. The
              // previous flat 90-percent cap did not account for the offset at all: at
              // 1440x900 the modal was anchored 115px down and allowed to grow to
              // 810px, i.e. 925px inside a 900px viewport — it overflowed the
              // bottom edge by 25px, and by ~22px on a 1280x800 laptop. Keep the
              // two clamps identical if either is ever retuned.
              "surface-modal top-[clamp(40px,8vw,120px)] max-h-[calc(100dvh-2*clamp(40px,8vw,120px))] left-[50%] max-w-[calc(100%-2rem)] translate-x-[-50%] duration-[var(--motion-duration-modal)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
          className,
          // Keep the mobile sheet full-width: neutralize any consumer `sm:max-w-*`
          // that would otherwise apply in the 640–767px band (Tailwind `sm` = 640px
          // sits below the `md`/`useIsMobile` boundary) and cap the bottom sheet to a
          // left-pinned column. Placed after `className` so it wins the merge.
          isMobile && "max-w-none sm:max-w-none",
        )}
        {...props}
      >
        {isMobile && (
          // Visual grabber that reads as a bottom sheet. Decorative only — the
          // sheet is dismissed via the close affordance, scrim tap, or Escape
          // (no drag gesture); hidden from assistive tech.
          <div
            aria-hidden="true"
            className="mx-auto h-1 w-12 shrink-0 rounded-full bg-alpha-subtle"
          />
        )}
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 rounded-control opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-hidden disabled:pointer-events-none data-[state=open]:bg-alpha-subtle data-[state=open]:fg-subtle [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("type-headline", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("type-body-2 fg-subtle", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
