import * as React from "react"

import { cn } from "@/app/lib/utils"

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
