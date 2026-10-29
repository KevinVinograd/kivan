import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/app/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 py-0 whitespace-nowrap status-chrome [&>svg]:size-3 [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        neutral: "",
        success: "",
        warning: "",
        danger: "",
        outline: "border border-alpha-subtle fg-default",
        primary: "bg-primary-default fg-reverse",
      },
      highContrast: {
        false: "",
        true: "",
      },
      shape: {
        default: "",
        pill: "rounded-full",
      },
    },
    compoundVariants: [
      { variant: "neutral", highContrast: false, class: "status-neutral-subtle" },
      { variant: "success", highContrast: false, class: "status-success-subtle" },
      { variant: "warning", highContrast: false, class: "status-warning-subtle" },
      { variant: "danger", highContrast: false, class: "status-danger-subtle" },
      { variant: "neutral", highContrast: true, class: "status-neutral-emphasis" },
      { variant: "success", highContrast: true, class: "status-success-emphasis" },
      { variant: "warning", highContrast: true, class: "status-warning-emphasis" },
      { variant: "danger", highContrast: true, class: "status-danger-emphasis" },
    ],
    defaultVariants: {
      variant: "neutral",
      highContrast: false,
      shape: "pill",
    },
  },
)

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>
export type BadgeShape = NonNullable<VariantProps<typeof badgeVariants>["shape"]>

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {
  truncate?: boolean
}

export function Badge({
  className,
  variant,
  shape,
  highContrast,
  truncate = false,
  title,
  children,
  ...props
}: BadgeProps) {
  const resolvedTitle = title ?? (truncate && typeof children === "string" ? children : undefined)
  return (
    <span
      data-slot="badge"
      data-variant={variant ?? "neutral"}
      data-high-contrast={highContrast ? "" : undefined}
      title={resolvedTitle}
      className={cn(
        badgeVariants({ variant, shape, highContrast }),
        truncate && "w-auto shrink min-w-0 max-w-full",
        className,
      )}
      {...props}
    >
      {truncate ? <span className="min-w-0 truncate">{children}</span> : children}
    </span>
  )
}

export { badgeVariants }
