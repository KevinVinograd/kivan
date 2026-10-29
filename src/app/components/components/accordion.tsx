import * as React from "react"
import { Accordion as AccordionPrimitive } from "radix-ui"
import { CaretDown as ChevronDownIcon } from "@phosphor-icons/react"

import { cn } from "@/app/lib/utils"

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
