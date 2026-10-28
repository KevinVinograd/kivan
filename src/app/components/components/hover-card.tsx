import * as React from "react"
import { HoverCard as HoverCardPrimitive } from "radix-ui"

import { cn } from "@/app/lib/utils"

/**
 * HoverCard — shadcn/ui (new-york) Radix hover-card, token-adapted. The floating
 * surface reuses the shared `surface-raised` recipe (the token system's named
 * target for "Popover, DropdownMenu, Select listbox" — `bg-surface-flat` +
 * `border-alpha-subtle` + container radius + raised shadow), same as `Popover`.
 *
 * Unlike `Popover` (click-driven), HoverCard opens on pointer hover AND keyboard
 * focus of its trigger, with Radix-managed open/close delays — the right
 * primitive for a passive, non-modal preview of rich content. The `openDelay` /
 * `closeDelay` defaults below are baked into the Root so consumers get the
 * canonical timing without repeating it; both stay overridable. Escape and
 * pointer-leave dismissal are Radix's. Theme is handled by the tokens (no
 * `dark:` overrides); `"use client"` removed (Vite, not RSC).
 */
function HoverCard({
  openDelay = 300,
  closeDelay = 150,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return (
    <HoverCardPrimitive.Root
      data-slot="hover-card"
      openDelay={openDelay}
      closeDelay={closeDelay}
      {...props}
    />
  )
}

function HoverCardTrigger({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
}

function HoverCardContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-80 origin-(--radix-hover-card-content-transform-origin) surface-raised p-4 fg-default outline-hidden duration-[var(--motion-duration-quick)] data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
