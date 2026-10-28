import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "radix-ui"

import { cn } from "@/app/lib/utils"
import { useIsMobile } from "@/app/lib/use-is-mobile"
import {
  buttonVariants,
  type ButtonVariant,
  type ButtonColor,
} from "@/app/components/components/button"

/**
 * AlertDialog — shadcn/ui (new-york) Radix alert dialog, token-adapted. A blocking
 * confirmation modal: the backdrop uses the `bg-overlay-default` scrim and the
 * panel uses the shared `surface-modal` recipe. The action/cancel buttons are
 * rewired off the source's `Button` import (the frozen custom Button has no
 * `asChild`/`size`) onto the `buttonVariants` recipe applied directly to the Radix
 * `Action`/`Cancel` elements (the Pagination/Calendar precedent): Action defaults
 * to `solid/primary`, Cancel to `outlined/primary`, both overridable for
 * destructive confirmations (`color="danger"`). The non-standard `AlertDialogMedia`
 * helper and its media-aware responsive grid were not adopted. Titles map to
 * `type-heading`, descriptions to `type-body-2 fg-subtle`. Theme is handled by the
 * tokens (no `dark:` overrides).
 *
 * Responsive: on mobile (≤767px via `useIsMobile`) the panel docks to the bottom
 * edge as a slide-up sheet (rounded top, single top hairline, visual grabber)
 * instead of centering; at `md`+ the centered `surface-modal` chrome and the
 * `size` cap are unchanged (`size` is ignored on mobile — the sheet is full width).
 * The mobile chrome is composed inline rather than via `surface-modal` because an
 * edge-flush sheet must not round all corners, mirroring `Sheet` `side="bottom"`.
 * Radix `AlertDialog` keeps its no-outside-click contract — the sheet is dismissed
 * via the Cancel/Action buttons or Escape, not a scrim tap.
 */
function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(function AlertDialogOverlay({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Overlay
      ref={ref}
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-overlay-default backdrop-blur-[var(--overlay-blur)] backdrop-grayscale duration-[var(--motion-duration-quick)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  )
})

function AlertDialogContent({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: "default" | "sm"
}) {
  const isMobile = useIsMobile()
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-size={size}
        data-variant={isMobile ? "sheet" : "modal"}
        className={cn(
          // Shared chrome: grid body, capped height with internal scroll.
          "fixed z-50 grid w-full gap-4 overflow-y-auto p-6",
          isMobile
            ? // Mobile: bottom-docked slide-up sheet. Inline chrome (not
              // `surface-modal`) so only the top corners round and only a top
              // hairline draws. `size` does not apply — the sheet spans the full
              // width; bottom padding comes from the shared `p-6`. Edge-flush by
              // design, so it keeps the plain 90dvh cap.
              "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-layout border-t border-alpha-subtle bg-surface-recessed shadow-raised duration-[var(--motion-duration-panel)] data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom"
            : // Desktop: centered, top-anchored modal capped by `size`.
              //
              // MODAL BOTTOM GUTTER (rule) — the height cap subtracts the top
              // offset twice, so the gap below always equals the gap above and
              // never falls under the clamp's 40px floor. Mirrors `dialog.tsx`;
              // keep the two in step. A plain `max-h-[90dvh]` ignores the offset
              // and overflows the bottom edge on any laptop-height viewport.
              "surface-modal top-[clamp(40px,8vw,120px)] max-h-[calc(100dvh-2*clamp(40px,8vw,120px))] left-[50%] max-w-[calc(100%-2rem)] translate-x-[-50%] duration-[var(--motion-duration-modal)] data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
          // Keep the mobile sheet full-width: neutralize any consumer `sm:max-w-*`
          // applied in the 640–767px band (Tailwind `sm` = 640px sits below the
          // `md`/`useIsMobile` boundary). Placed after `className` so it wins.
          isMobile && "max-w-none sm:max-w-none",
        )}
        {...props}
      >
        {isMobile && (
          // Visual grabber that reads as a bottom sheet (decorative; no drag).
          // Dismiss via Cancel/Action or Escape. Hidden from assistive tech.
          <div
            aria-hidden="true"
            className="mx-auto h-1 w-12 shrink-0 rounded-full bg-alpha-subtle"
          />
        )}
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-1 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("type-headline", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("type-body-2 fg-subtle", className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  variant = "solid",
  color = "primary",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
  variant?: ButtonVariant
  color?: ButtonColor
}) {
  return (
    <AlertDialogPrimitive.Action
      data-slot="alert-dialog-action"
      className={cn(
        buttonVariants({ variant, color }),
        "px-[var(--button-padding-x)] py-[var(--button-padding-y)]",
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogCancel({
  className,
  variant = "outlined",
  color = "primary",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> & {
  variant?: ButtonVariant
  color?: ButtonColor
}) {
  return (
    <AlertDialogPrimitive.Cancel
      data-slot="alert-dialog-cancel"
      className={cn(
        buttonVariants({ variant, color }),
        "px-[var(--button-padding-x)] py-[var(--button-padding-y)]",
        className,
      )}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
