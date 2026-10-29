import * as React from "react"
import { Check as CheckIcon } from "@phosphor-icons/react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/app/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-selection border border-control bg-control-off transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger-emphasis data-[state=checked]:border-control-on data-[state=checked]:bg-control-on data-[state=checked]:fg-control-on",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
