import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'

import { Button, type ButtonColor, type ButtonSize, type ButtonVariant } from '@/app/components/components'

/**
 * A dashboard CTA: the real `Button` primitive wired to in-app (SPA) navigation.
 * Every dashboard section routes to an existing page, so this centralizes the
 * navigate behavior and keeps the button sizing/variant consistent (the bare
 * `buttonVariants` recipe carries no padding — that lives on `Button`).
 */
export function DashboardCta({
  href,
  children,
  variant = 'outlined',
  color = 'primary',
  size = 'dense',
  className,
}: {
  href: string
  children: ReactNode
  variant?: ButtonVariant
  color?: ButtonColor
  size?: ButtonSize
  className?: string
}) {
  const navigate = useNavigate()
  return (
    <Button variant={variant} color={color} size={size} className={className} onClick={() => navigate(href)}>
      {children}
    </Button>
  )
}

/**
 * A dashboard-card CTA that floats over the card's bottom-right corner instead of
 * reserving a column in the header row — so the title reclaims the card's full
 * width and stops wrapping into a narrow column. Revealed on hover/focus.
 *
 * The transparent outlined button gets an opaque backing that tracks the card's
 * surface so it blends in with no contrast, while still hiding the card text under
 * the button. The interactive card is `bg-surface-flat` at rest and, on hover,
 * `bg-alpha-subtle-hover` (a 6% ink alpha) composited over `--page-bg` (the hover
 * overrides the flat fill, so the alpha lands on the page, not on surface-flat). The
 * backing mirrors both: `bg-surface-flat` at rest / keyboard-focus, switching on
 * `group-hover` to `bg-page` + `bg-alpha-subtle-hover`. This matters because keyboard
 * `focus-within` reveals the CTA with no `:hover`, where the card is still at rest.
 * No frost / blur: a `backdrop-filter` cannot be softly faded (a CSS mask destroys
 * it), and a solid matched backing reads cleaner. The backing sits behind the button
 * (`z-0`); the label stays crisp (`z-10`).
 *
 * Call-site contract: the `Card` must carry `group relative overflow-hidden` (group
 * for `group-hover`, relative so `absolute bottom-4 right-4` anchors to the card
 * corner, overflow-hidden so the backing clips to the rounded corner), and this
 * element MUST be the last child of `CardContent` (it covers the text it sits over).
 */
export function FloatingCardCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <span className="absolute bottom-4 right-4 opacity-0 motion-standard group-hover:opacity-100 focus-within:opacity-100">
      {/* Backing mirrors the card surface so it stays invisible against it: opaque
          `bg-surface-flat` at rest / keyboard-focus, switching on `group-hover` to
          `bg-page` + a 6% ink alpha — the card's hover surface (its hover overrides
          the flat fill, so the alpha composites over `--page-bg`, not surface-flat). */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-3 z-0 rounded-container bg-surface-flat group-hover:bg-page"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-3 z-0 rounded-container group-hover:bg-alpha-subtle-hover"
      />
      <span className="relative z-10">
        <DashboardCta href={href}>{children}</DashboardCta>
      </span>
    </span>
  )
}
