import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/app/lib/utils"

const INDICATOR_FG = {
  default: "fg-primary",
  success: "fg-success",
  warning: "fg-warning",
  danger: "fg-danger",
} as const

export type ProgressTone = keyof typeof INDICATOR_FG

export type ProgressProps = React.ComponentProps<typeof ProgressPrimitive.Root> & {
  tone?: ProgressTone
}

export function Progress({ className, value, tone = "default", ...props }: ProgressProps) {
  const filled = Math.max(0, Math.min(100, value ?? 0))
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-alpha-subtle",
        className,
      )}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator asChild>
        <svg
          data-slot="progress-indicator"
          data-tone={tone}
          className={cn("block h-full w-full", INDICATOR_FG[tone])}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <rect
            x="0"
            y="0"
            height="100"
            width={filled}
            fill="currentColor"
            className="transition-[width] duration-[var(--motion-duration-quick)] ease-[var(--motion-ease-out)] motion-reduce:transition-none"
          />
        </svg>
      </ProgressPrimitive.Indicator>
    </ProgressPrimitive.Root>
  )
}
