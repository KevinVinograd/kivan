import * as React from "react"

import { cn } from "@/app/lib/utils"

/**
 * Skeleton — shadcn/ui (new-york) skeleton, token-adapted. A pulsing placeholder
 * block for loading states: neutral subtle fill (`bg-alpha-subtle`) + control
 * radius. Size and shape are the consumer's job via `className` layout utilities.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-control bg-alpha-subtle", className)}
      {...props}
    />
  )
}

export { Skeleton }
