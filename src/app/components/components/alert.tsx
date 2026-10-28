import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/app/lib/utils"

/**
 * Alert — shadcn/ui (new-york) base adapted to the token system. A static,
 * inline status callout (NOT a toast, NOT a Dialog): a bordered soft-surface
 * block with an optional leading icon, a title and a description. The raw CLI
 * output (`rounded-lg`, `bg-card`, `text-destructive`, `text-muted-foreground`,
 * the `default`/`destructive` pair) was replaced with the semantic tone families
 * — `info` / `success` / `warning` / `danger` carried by a `bg-*-subtle` fill over
 * a shared neutral `border-alpha-subtle` hairline (tone in the surface, text stays
 * `fg-default`). The surface carries a `shadow-subtle` elevation. The optional
 * icon lays out via the inner content's `has-[>svg]` grid; pass a registered
 * icon as the first child. An optional `action` renders as a trailing slot — it
 * centers with a title-only alert and top-aligns when a subtitle
 * (`AlertDescription`, also `fg-default`) is present.
 */
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
  /** Optional trailing slot for a single action (e.g. a "Completar" Button). */
  action?: React.ReactNode
  /**
   * Optional footer row below the content for up to 3 action buttons (e.g.
   * Reintentar / Asociar / Editar on a danger alert). Wraps on narrow widths.
   */
  footer?: React.ReactNode
}

/**
 * `variant` selects the surface tone: `info` (default) for neutral notices,
 * `success` / `warning` / `danger` for status. The block carries `role="alert"`;
 * the title states the message in text so tone is never the sole carrier of
 * meaning. Compose with `AlertTitle` + `AlertDescription`; pass `action` for a
 * single trailing control, or `footer` for a row of up to 3 actions below the
 * content (the resolution CTAs for an error/warning).
 */
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
