import * as React from "react"
import { X as XIcon } from "@phosphor-icons/react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@/app/lib/utils"
import { useIsBelowDesktop } from "@/app/lib/use-is-mobile"

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
          rightIsBottomSheet && BOTTOM_SHEET_CLASS,
          side === "right" &&
            !isBelowDesktop &&
            "inset-y-2 right-2 h-auto w-1/2 rounded-layout border border-alpha-subtle data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right desktop:w-1/3",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 border-r border-alpha-subtle data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm md:inset-y-2 md:left-2 md:h-auto md:rounded-layout md:border",
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
