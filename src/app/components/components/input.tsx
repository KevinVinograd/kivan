import * as React from "react"

import { cn } from "@/app/lib/utils"

export type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
  size?: "default" | "dense"
  trailingAction?: React.ReactNode
}

function Input({
  className,
  type,
  size = "default",
  trailingAction,
  ...props
}: InputProps) {
  const field = (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(
        "w-full min-w-0 rounded-control border border-control bg-control px-3 py-1 type-body transition-[color,box-shadow,border-color] outline-none hover:border-control-hover selection:bg-primary-default selection:fg-reverse file:inline-flex file:h-7 file:border-0 file:bg-alpha-transparent file:type-body-2 file:font-medium file:fg-default placeholder:fg-control-placeholder disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:type-body-2",
        size === "dense" ? "h-8" : "h-10",
        "focus-visible:ring-2 focus-visible:ring-focus",
        "aria-invalid:border-danger-emphasis",
        trailingAction && (size === "dense" ? "pr-9" : "pr-10"),
        trailingAction && "[&::-ms-reveal]:hidden",
        trailingAction ? undefined : className,
      )}
      {...props}
    />
  )

  if (!trailingAction) return field

  return (
    <div data-slot="input-wrapper" className={cn("relative", className)}>
      {field}
      <span
        data-slot="input-trailing"
        className="absolute inset-y-1 right-1 flex items-center rounded-control bg-control"
      >
        {trailingAction}
      </span>
    </div>
  )
}

export { Input }
