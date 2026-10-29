import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/app/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-container border border-alpha-subtle px-4 py-3 type-body-2 fg-default shadow-subtle",
  {
    variants: {
      variant: {
        info: "bg-alpha-subtle",
        success: "bg-success-subtle",
        warning: "bg-warning-subtle",
        danger: "bg-danger-subtle",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
)

export type AlertVariant = NonNullable<VariantProps<typeof alertVariants>["variant"]>

export interface AlertProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof alertVariants> {
  action?: React.ReactNode
  footer?: React.ReactNode
}

export function Alert({ className, variant, action, footer, children, ...props }: AlertProps) {
  return (
    <div
      data-slot="alert"
      data-variant={variant ?? "info"}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <div className="flex w-full items-center gap-3 has-[[data-slot=alert-description]]:items-start">
        <div
          data-slot="alert-content"
          className="grid min-w-0 flex-1 grid-cols-[0_1fr] items-start gap-y-0.5 has-[>svg]:grid-cols-[1rem_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:pointer-events-none"
        >
          {children}
        </div>
        {action ? (
          <div data-slot="alert-action" className="shrink-0">
            {action}
          </div>
        ) : null}
      </div>
      {footer ? (
        <div data-slot="alert-footer" className="mt-3 flex flex-wrap gap-2">
          {footer}
        </div>
      ) : null}
    </div>
  )
}

export function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 min-h-4 font-medium fg-default", className)}
      {...props}
    />
  )
}

export function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 grid justify-items-start gap-1 type-caption fg-default", className)}
      {...props}
    />
  )
}

export { alertVariants }
