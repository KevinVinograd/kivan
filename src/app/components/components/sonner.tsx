import { Toaster as Sonner, toast, type ToasterProps } from "sonner"

import { cn } from "@/app/lib/utils"
import { useTheme } from "@/app/lib/use-theme"

/**
 * Sonner — shadcn/ui (new-york) toast portal, token-adapted. A single mounted
 * `<Toaster />` renders transient, non-blocking action feedback (success /
 * error / info) triggered imperatively via `toast(...)` from anywhere in the
 * tree. It is the sanctioned source of toast chrome — features call `toast`
 * instead of hand-rolling notification banners.
 *
 * Token adaptation of the registry source: `"use client"` removed (Vite, not
 * Next); the `lucide-react` custom `icons` map dropped (Sonner's built-in icons
 * render instead — no off-registry icon imports); `next-themes` swapped for the
 * app `useTheme`; and the shadcn default CSS variables remapped onto this repo's
 * tokens. Sonner injects its own stylesheet at runtime and themes each toast
 * through these four CSS variables, so pointing them at the semantic tokens
 * (via Tailwind arbitrary-property utilities, never a raw `style` prop) is the
 * robust path: the surface follows `surface-flat` + the alpha-subtle hairline +
 * container radius, and text follows `fg-default`. Theme flips with the app via
 * `theme`.
 *
 * Motion (Motion System v0): toast enter/exit is OWNED by Sonner — a sober short
 * slide + fade that already honors `prefers-reduced-motion` natively, and Sonner
 * collapses stacked toasts by default (satisfying the "don't saturate" UX rule).
 * Sonner's internal keyframes are NOT exposed through its themeable vars, so we
 * do not re-time them to the motion tokens; that alignment is documented v0 debt
 * in `semantics-motion.css`. Operative feedback is fired imperatively via
 * `toast.success` / `toast.error` / `toast.warning`.
 */
function Toaster({ className, ...props }: ToasterProps) {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      className={cn(
        "toaster group",
        "[--normal-bg:var(--color-surface-flat)]",
        "[--normal-text:var(--color-fg-default)]",
        "[--normal-border:var(--color-border-alpha-subtle)]",
        "[--border-radius:var(--radius-container)]",
        className,
      )}
      {...props}
    />
  )
}

export { Toaster, toast }
