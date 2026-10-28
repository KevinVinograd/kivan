import * as React from "react"
import { Slot } from "radix-ui"
import { CaretRight, DotsThree } from "@phosphor-icons/react"

import { cn } from "@/app/lib/utils"

/**
 * Breadcrumb — shadcn/ui (new-york) Radix-Slot breadcrumb, token-adapted. A
 * navigation trail showing the path to the current page. Resting links read
 * `fg-subtle` and lift to `fg-default` on hover (motion-token transition); the
 * current page (`BreadcrumbPage`) is the non-interactive `fg-default` leaf. The
 * separator and ellipsis are decorative chrome (registered Phosphor affordances
 * `CaretRight` / `DotsThree`). `BreadcrumbLink asChild` composes a router `Link`
 * so navigation stays SPA. Theme is handled by the tokens (no `dark:` overrides);
 * raw `text-muted-foreground` / `text-foreground` / `text-sm` stripped for the
 * `fg-*` + `type-*` token equivalents. Adopted from the known new-york source
 * (registry existence-check blocked by the env TLS limit — Breadcrumb is a core
 * shadcn primitive of certain existence).
 */
function Breadcrumb({ ...props }: React.ComponentProps<"nav">) {
  return <nav aria-label="Ruta de navegación" data-slot="breadcrumb" {...props} />
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex flex-wrap items-center gap-1 break-words type-caption fg-subtle",
        className,
      )}
      {...props}
    />
  )
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

function BreadcrumbLink({
  asChild,
  className,
  ...props
}: React.ComponentProps<"a"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a"
  return (
    <Comp
      data-slot="breadcrumb-link"
      className={cn(
        "rounded-sm outline-none transition-colors duration-[var(--motion-duration-hover)] ease-[var(--motion-ease-out)] hover:fg-default focus-visible:ring-2 focus-visible:ring-focus",
        className,
      )}
      {...props}
    />
  )
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("font-medium fg-default", className)}
      {...props}
    />
  )
}

function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3", className)}
      {...props}
    >
      {children ?? <CaretRight />}
    </li>
  )
}

function BreadcrumbEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <DotsThree className="size-4" />
      <span className="sr-only">Más</span>
    </span>
  )
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}
