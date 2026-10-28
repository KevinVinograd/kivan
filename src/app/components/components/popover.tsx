import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/app/lib/utils"

/**
 * Popover — shadcn/ui (new-york) Radix popover, token-adapted. The floating
 * surface uses the shared `surface-raised` recipe (the token system's named
 * target for "Popover, DropdownMenu, Select listbox" — `bg-surface-flat` +
 * `border-alpha-subtle` + container radius + raised shadow). Core four parts
 * (Root / Trigger / Content / Anchor); the non-standard Header/Title/Description
 * helpers from the source were not adopted. Theme is handled by the tokens
 * (no `dark:` overrides).
 */
function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          // Enter/exit run through tw-animate-css (fade + zoom + side slide),
          // timed by the motion tokens via `duration-*`: 160ms in (ease-out),
          // 120ms out. Sober, no bounce. See `lib/motion.ts` / semantics-motion.css.
          "z-50 w-72 origin-(--radix-popover-content-transform-origin) surface-raised p-2 fg-default outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-[var(--motion-duration-hover)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-[var(--motion-duration-quick)]",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
