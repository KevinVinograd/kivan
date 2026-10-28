import { forwardRef, type ReactNode } from 'react'
import { cn } from '@/app/lib/utils'

export type MainContentProps = {
  children: ReactNode
  /** Drop the page fill so a shell-level background (the daytime hero wash) shows
   *  through behind the content. The shell root keeps `bg-page` as the ground the
   *  wash resolves into. Defaults to the opaque page fill. */
  transparent?: boolean
}

/**
 * Page content region of the app shell. Owns vertical scrolling and establishes
 * the height context (`flex flex-col min-h-0`) so a height-bounded page (e.g. a
 * master-detail split with independently scrolling panels) can fill the viewport
 * and scroll internally; pages that simply overflow still scroll here. It takes
 * all remaining width beside the SideNav and applies NO bottom gutter of its
 * own: the 24px viewport-floor clearance lives on PageContent. It cannot live
 * here because this `<main>` is a flex column that is ALSO the scroll container,
 * and such a container drops its own `padding-bottom` from the scrollable region
 * at scroll-end (Chromium/WebKit) — so the gutter has to be an in-flow spacer
 * inside the content (see PageContent). It also applies no horizontal or top
 * page gutter (owned by PageHeader / SectionHeader / PanelContent so panels can
 * sit flush to the content edges) and NO global max-width so data-heavy pages
 * (dashboards, tables, reports) can use the full available width.
 *
 * Mobile floating-header offset: on mobile the AppShell top nav is an absolute
 * floating pill that overlaps this scroll region, so content scrolls underneath it.
 * `pt-16` (64px, cleared at `md`) clears the ~62px mobile header (pt-2 wrapper top
 * inset + the 54px pill; the wrapper is flush at the bottom) so the first content
 * sits just below the pill on load while still scrolling under it. Keep this in
 * sync with the AppShell mobile header height.
 *
 * Ref: forwards its ref to the `<main>` scroll element so AppShell can observe the
 * scroll direction (via `useScrollDirection`) to auto-hide the mobile header.
 *
 * Accessibility: this `<main>` is the app's single skip-link target AND the
 * programmatic focus target on client-side navigation. It carries
 * `id="main-content"` (the `href="#main-content"` skip link in AppShell points
 * here), `tabIndex={-1}` so AppShell can move focus to it on route change without
 * adding it to the tab order, and a STABLE `aria-label` naming the landmark.
 * `outline-none` suppresses the focus ring on this non-interactive region.
 * The name is intentionally NOT the destination page title: the page-title
 * context lags a route change by one commit, so announcing it here would name the
 * page the user came FROM. Announcing the specific destination page is a tracked
 * follow-up (an aria-live route announcer).
 */
export const MainContent = forwardRef<HTMLElement, MainContentProps>(function MainContent(
  { children, transparent = false },
  ref,
) {
  return (
    <main
      ref={ref}
      id="main-content"
      tabIndex={-1}
      aria-label="Contenido principal"
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-y-auto pt-16 outline-none md:pt-0',
        transparent ? 'bg-alpha-transparent' : 'bg-page',
      )}
    >
      {children}
    </main>
  )
})
