import * as React from "react"

import { cn } from "@/app/lib/utils"

function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-16 w-full min-w-0 rounded-control border border-control bg-control px-3 py-2 type-body transition-[color,box-shadow,border-color] outline-none hover:border-control-hover selection:bg-primary-default selection:fg-reverse placeholder:fg-control-placeholder disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:type-body-2",
        "focus-visible:ring-2 focus-visible:ring-focus",
        "aria-invalid:border-danger-emphasis",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
