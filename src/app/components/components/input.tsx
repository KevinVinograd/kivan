import * as React from "react"

import { cn } from "@/app/lib/utils"

export type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
  /** Control height: `default` (40px) or `dense` (32px) — matches Button/Select. */
  size?: "default" | "dense"
  /**
   * An in-field trailing control — a password reveal toggle, a clear button.
   * Pass an `IconButton` (`variant="transparent"`, `size="dense"`).
   *
   * Set it and the field grows a positioning wrapper: the wrapper takes
   * `className`, the input reserves the right padding the control occupies, and
   * the control is pinned to the trailing edge on the input's own `bg-control`
   * fill — so a long value scrolled to its end is masked by the slot rather than
   * colliding with the glyph. Leave it unset and the component renders a bare
   * `<input>` and `className` lands on the input, exactly as it always has.
   */
  trailingAction?: React.ReactNode
}

/**
 * Input — shadcn/ui (new-york) input, token-adapted to the form-control token
 * family (`bg-control` / `border-control` / `fg-control-placeholder`), per
 * `semantics-control.css`. Focus uses the shared `ring-focus` halo; aria-invalid
 * swaps to the danger border; text selection uses the primary-emphasis pair.
 * Theme is handled by the tokens themselves (no `dark:` overrides).
 *
 * The wrapper is deliberately conditional. Emitting it unconditionally would
 * re-route `className` from the input onto a new container, and the consumers
 * that size Input as a flex child (`toolbar.tsx`'s search box: `min-w-0 flex-1`;
 * the cobros/pagos search boxes: `shrink-0`) would silently lose their layout.
 * No `trailingAction`, no wrapper, identical DOM.
 */
function Input({
  className,
  type,
  size = "default",
  trailingAction,
  ...props
}: InputProps) {
  const field = (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(
        "w-full min-w-0 rounded-control border border-control bg-control px-3 py-1 type-body transition-[color,box-shadow,border-color] outline-none hover:border-control-hover selection:bg-primary-default selection:fg-reverse file:inline-flex file:h-7 file:border-0 file:bg-alpha-transparent file:type-body-2 file:font-medium file:fg-default placeholder:fg-control-placeholder disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:type-body-2",
        size === "dense" ? "h-8" : "h-10",
        "focus-visible:ring-2 focus-visible:ring-focus",
        "aria-invalid:border-danger-emphasis",
        // Reserve the trailing control's footprint so the value never runs under it,
        // and suppress Edge's native password eye — otherwise `::-ms-reveal` renders a
        // SECOND eye just inside the reserved padding, beside ours. (The old text chip
        // was wide enough to cover it by accident; a 32px control is not.)
        trailingAction && (size === "dense" ? "pr-9" : "pr-10"),
        trailingAction && "[&::-ms-reveal]:hidden",
        trailingAction ? undefined : className,
      )}
      {...props}
    />
  )

  if (!trailingAction) return field

  return (
    <div data-slot="input-wrapper" className={cn("relative", className)}>
      {field}
      {/* The slot carries the input's own `bg-control` fill: the reserved padding
          keeps the value out of the control's box, and the opaque fill covers the
          rest. The control itself stays transparent — a peer component's color is
          not the consumer's to override. */}
      <span
        data-slot="input-trailing"
        className="absolute inset-y-1 right-1 flex items-center rounded-control bg-control"
      >
        {trailingAction}
      </span>
    </div>
  )
}

export { Input }
