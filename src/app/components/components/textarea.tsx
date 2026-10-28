import * as React from "react"

import { cn } from "@/app/lib/utils"

/**
 * Textarea — shadcn/ui (new-york) textarea, token-adapted to the form-control
 * token family (`bg-control` / `border-control` / `fg-control-placeholder`), per
 * `semantics-control.css`. The multi-line counterpart of Input: same shell
 * chrome (border, background, focus halo, placeholder, invalid, disabled),
 * sized with a `min-h` floor instead of a fixed height. The shadcn registry CLI
 * is unreachable in this environment (TLS), so the chrome is hand-authored from
 * the canonical new-york source and token-adapted to mirror Input (raw
 * `border-input` / `bg-transparent` / `text-base` / `text-muted-foreground` /
 * `shadow-xs` / `ring-ring` / `border-destructive` / `dark:*` replaced). Focus
 * uses the shared `ring-focus` halo; aria-invalid swaps to the danger border;
 * text selection uses the primary pair. Theme is handled by the tokens
 * themselves (no `dark:` overrides).
 */
function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-16 w-full min-w-0 rounded-control border border-control bg-control px-3 py-2 type-body transition-[color,box-shadow,border-color] outline-none hover:border-control-hover selection:bg-primary-default selection:fg-reverse placeholder:fg-control-placeholder disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:type-body-2",
        "focus-visible:ring-2 focus-visible:ring-focus",
        "aria-invalid:border-danger-emphasis",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
