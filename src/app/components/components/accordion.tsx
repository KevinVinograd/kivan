import * as React from "react"
import { Accordion as AccordionPrimitive } from "radix-ui"
import { CaretDown as ChevronDownIcon } from "@phosphor-icons/react"

import { cn } from "@/app/lib/utils"

/**
 * Accordion — shadcn/ui (new-york) Radix accordion, token-adapted. A vertically
 * stacked set of disclosure sections; each item is a header trigger plus a
 * collapsible content region. Item dividers use `border-alpha-subtle`, the
 * trigger label is `type-body-2` / `fg-default` (or `type-section` via
 * `emphasis="section"`), and the chevron (the shared
 * `CaretDown` affordance glyph) rotates 180° on open. Height open/close is
 * animated by the `accordion-down` / `accordion-up` keyframes (src/styles/
 * theme.css), driven by Radix's `--radix-accordion-content-height`. Theme is
 * handled by the tokens (no `dark:` overrides); `"use client"` removed (Vite,
 * not RSC).
 */
function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn(className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  emphasis = "default",
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> & {
  /**
   * Title typography. `default` is the standard `type-body-2` trigger label;
   * `section` promotes it to the canonical section-title treatment
   * (`type-section`, matching SectionHeader) for accordions used as titled
   * section cards. This prop is the sanctioned way to change the trigger's
   * type scale — a call-site `type-*` className override is forbidden by
   * the convention.
   */
  emphasis?: "default" | "section"
}) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "flex flex-1 items-center justify-between gap-4 rounded-control px-2 py-3 text-left fg-default outline-none transition-colors duration-[var(--motion-duration-hover)] hover:bg-alpha-transparent-hover focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
          emphasis === "section" ? "type-section" : "type-body-2 font-medium",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon
          className="pointer-events-none size-4 shrink-0 fg-subtle transition-transform duration-[var(--motion-duration-quick)] motion-reduce:transition-none"
          aria-hidden
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  inset = true,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content> & {
  /**
   * Horizontal inset of the content body. `true` (default) keeps the 8px L/R
   * padding that aligns the body under the trigger label; `false` makes the body
   * flush (0px L/R) so an edge-to-edge table can fill the card width. Vertical
   * spacing (`pt-0 pb-3`) is unchanged either way. This prop is the sanctioned
   * way to drop the inset — a call-site `px-*` override is forbidden by
   * the convention.
   */
  inset?: boolean
}) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div className={cn(inset ? "px-2 pt-0 pb-3" : "pt-0 pb-3", className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
