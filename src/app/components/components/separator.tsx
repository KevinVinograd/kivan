import * as React from "react"
import { Separator as SeparatorPrimitive } from "radix-ui"

import { cn } from "@/app/lib/utils"

/**
 * Separator — shadcn/ui (new-york) Radix separator, token-adapted. A thin
 * divider (horizontal or vertical) colored with the canonical hairline token
 * `--border-alpha-subtle` (the same value table dividers use). That token has no
 * `bg-*` utility of its own, so the fill is applied via the lint-safe
 * arbitrary-property form, matching the Button token pattern.
 */
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 [background-color:var(--border-alpha-subtle)] data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
