import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/app/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  )
}

type TabsVariant = "segmented" | "naked"

function TabsList({
  className,
  variant = "segmented",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        variant === "segmented" &&
          "inline-flex h-10 w-fit items-center justify-center gap-1 rounded-control bg-alpha-subtle p-1 fg-subtle",
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  variant = "segmented",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & { variant?: TabsVariant }) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-variant={variant}
      className={cn(
        variant === "segmented" &&
          "inline-flex h-8 items-center justify-center gap-1.5 rounded-control border border-alpha-transparent px-3 type-body-2 font-medium whitespace-nowrap transition-[color,box-shadow,background-color] duration-[var(--motion-duration-hover)] ease-[var(--motion-ease-out)] outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50 data-[state=inactive]:hover:bg-alpha-transparent-hover data-[state=active]:bg-page data-[state=active]:fg-default data-[state=active]:shadow-subtle [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
