import * as React from "react"
import { Avatar as AvatarPrimitive } from "radix-ui"

import { cn } from "@/app/lib/utils"

/**
 * Avatar — shadcn/ui (new-york) Radix avatar, token-adapted. Core trio:
 * `Avatar` (Root) + `AvatarImage` + `AvatarFallback`. The shadcn AvatarBadge /
 * AvatarGroup / AvatarGroupCount extras are intentionally omitted (no consumer
 * yet, and they carry a background-ring affordance whose token is undecided) —
 * reintroduce them via the adoption pipeline when the team column needs them.
 */
function Avatar({
  className,
  size = "default",
  active = false,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  size?: "default" | "sm" | "lg" | "xxl"
  /** Active/selected look: the fallback fills with accent-gray-emphasis + reverse text. */
  active?: boolean
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      data-active={active ? "true" : undefined}
      className={cn(
        "group/avatar relative flex size-8 shrink-0 overflow-hidden rounded-full border border-alpha-subtle select-none data-[size=sm]:size-6 data-[size=lg]:size-10 data-[size=xxl]:size-16",
        className,
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-alpha-subtle type-body-2 fg-subtle group-data-[size=sm]/avatar:type-caption group-data-[size=xxl]/avatar:type-display group-data-[size=xxl]/avatar:font-normal! group-data-[active=true]/avatar:bg-accent-gray-emphasis group-data-[active=true]/avatar:fg-reverse",
        className,
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
