import * as React from "react"

import { cn } from "@/app/lib/utils"
import { motionClass, MOTION_MAGNETIC_CARD, type MotionPreset } from "@/app/lib/motion"

const CARD_SURFACE = {
  default: "surface-subtle pin-surface-flat",
  outlined: "bg-surface-flat rounded-container pin-surface-flat",
  ghost: "bg-alpha-transparent rounded-container",
} as const

export type CardVariant = keyof typeof CARD_SURFACE

type CardProps = React.ComponentProps<"div"> & {
  variant?: CardVariant
  interactive?: boolean
  selected?: boolean
  motion?: MotionPreset
  size?: "default" | "compact"
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = "default", size = "default", interactive = false, selected = false, motion, ...props },
  ref,
) {
  const resolvedMotion: MotionPreset = motion ?? (interactive ? "standard" : "none")
  return (
    <div
      ref={ref}
      data-slot="card"
      data-variant={variant}
      data-size={size === "compact" ? "compact" : undefined}
      data-interactive={interactive ? "true" : undefined}
      data-selected={interactive && selected ? "true" : undefined}
      className={cn(
        CARD_SURFACE[variant],
        "flex flex-col gap-6 border border-alpha-subtle fg-default",
        size === "compact"
          ? "p-2 data-[size=compact]:rounded-control [&_[data-slot=card-content]]:px-0 [&_[data-slot=card-header]]:px-0 [&_[data-slot=card-footer]]:px-0"
          : "py-4",
        interactive && "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-focus",
        interactive && !selected && "hover:border-alpha-subtle-hover hover:bg-alpha-subtle-hover",
        interactive && selected && "data-[selected=true]:border-alpha-subtle-active",
        interactive && selected && "data-[selected=true]:bg-alpha-subtle-selected",
        motionClass(resolvedMotion),
        resolvedMotion === "soft-magnetic" && MOTION_MAGNETIC_CARD,
        className,
      )}
      {...props}
    />
  )
})

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("type-body-2 fg-subtle", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  )
}

type CardContentProps = React.ComponentProps<"div"> & {
  density?: "comfortable" | "dense"
}

function CardContent({ className, density, ...props }: CardContentProps) {
  const ownsLayout = (className ?? "").split(/\s+/).some(
    (token) =>
      token === "flex" ||
      token === "grid" ||
      token === "inline-flex" ||
      token === "inline-grid" ||
      token === "block" ||
      token === "inline-block" ||
      token === "inline" ||
      token === "table" ||
      token === "contents" ||
      token === "flow-root" ||
      /^gap(?:-x|-y)?-/.test(token),
  )
  const ownedGap =
    density === "dense"
      ? "flex flex-col gap-2"
      : density === "comfortable"
        ? "flex flex-col gap-4"
        : ownsLayout
          ? ""
          : "flex flex-col gap-2 lg:gap-3 desktop:gap-4"
  return (
    <div data-slot="card-content" className={cn("px-4", ownedGap, className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-4", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
