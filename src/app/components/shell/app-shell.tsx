import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/app/lib/utils'
import { useScrollDirection } from '@/app/lib/use-scroll-direction'
import { PageActionsSlotContext } from '@/app/lib/page-actions-slot'
import { useKpiPinned } from '@/app/lib/kpi-pinned'
import { BrandLogo, IconButton } from '@/app/components/components'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import { DaytimeHero, useDaytime } from '@/app/daytime'
import { SideNav, type NavItem, type NavEntry, type NavUser, type NewAction } from './side-nav'
import { MainContent } from './main-content'

/** The dashboard route the daytime hero wash rides on (all three role variants). */
const DAYTIME_ROUTE = '/dashboard'

export type AppShellProps = {
  navItems: NavEntry[]
  footerNavItems?: NavItem[]
  activePath?: string
  /** Current page title (the page's L1 PageHeader `<h1>`), shown in the mobile
   *  pill so the revealed nav gives context of where the user is. Falls back to
   *  the brand wordmark when absent (e.g. a route that renders no PageHeader). */
  pageTitle?: string
  onNew?: () => void
  /** Create-entity actions behind the "Nuevo" launcher; turns it into a dropdown. */
  newActions?: NewAction[]
  /** The signed-in person, surfaced as the rail avatar menu (Mi perfil + Cerrar
   *  sesion). Threaded straight through: the shell reads no auth state of its own. */
  user?: NavUser
  children: ReactNode
}

/**
 * Owns the global application structure: SideNav on the left, MainContent
 * taking the remaining width. Holds both nav axes so SideNav can stay
 * presentational: the responsive drawer state (mobile) and the rail-collapsed
 * state (desktop icon rail). Knows nothing about which page renders inside
 * beyond the navigation active state and the active page title it shows in the
 * mobile pill.
 */
export function AppShell({ navItems, footerNavItems, activePath, pageTitle, onNew, newActions, user, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  // The mobile page-actions slot node (trailing zone of the single nav pill). A
  // page's PageHeader portals its primary action + overflow menu here on mobile,
  // so the CTAs share the pill, its auto-hide, and its elevation. Callback ref so
  // the context updates once the node mounts. `null` / hidden on desktop (md:hidden).
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null)

  // Mobile auto-hide: observe the MainContent scroll element so the floating pill
  // slides away on scroll-down and returns on scroll-up. `atTop` keeps the pill
  // flush (no elevation) at the start; once content scrolls under it, it elevates.
  const mainRef = useRef<HTMLElement>(null)
  const { hidden: navHidden, atTop } = useScrollDirection(mainRef)
  // A pinned KPI strip paints its own frosted band directly below this header's. When
  // one is up, the nav band must NOT overhang, or the two backdrop-filter layers stack
  // and composite the same 52px twice. See `@/app/lib/kpi-pinned`.
  const kpiPinned = useKpiPinned()

  // Time-of-day hero wash: painted only on the dashboard (all role variants share
  // the /dashboard route). When active the shell root becomes a stacking context
  // (`isolate`) so the z-index:-1 hero stays scoped, and MainContent drops its own
  // page fill so the wash shows through behind the content.
  const { isActive: daytimeActive, moment } = useDaytime()
  const heroActive = daytimeActive && activePath === DAYTIME_ROUTE

  // Route-change focus management (a11y): on a real client-side navigation move
  // focus to the <main> region so keyboard and screen-reader users land on the new
  // page's content instead of staying on the just-clicked nav item. Guard on an
  // actual activePath TRANSITION (prev -> next), not a one-shot flag, so the initial
  // render never steals focus and React StrictMode's double-invoke stays inert. Bail
  // out when focus is inside an open dialog/menu/listbox that manages its own focus,
  // so we never yank focus out of a modal. preventScroll keeps focusing the scroll
  // container from jumping the viewport.
  // Known limitation: a redirect during initial load (e.g. "/" -> "/dashboard") is a
  // post-mount transition, so focus can move on that first redirect; a fuller fix
  // keyed on navigation type is a tracked follow-up.
  const prevPathRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const prev = prevPathRef.current
    prevPathRef.current = activePath
    if (prev === undefined || prev === activePath) return
    // Close the mobile drawer on the same transition. Its nav links navigate the page
    // UNDERNEATH it, so without this the drawer and its full-screen backdrop stay standing
    // over the page the user just asked for, and the only way out is to find the X. Placed
    // before the focus bail-out below on purpose: the drawer must close even in the states
    // where we decline to move focus.
    setDrawerOpen(false)
    const active = document.activeElement
    if (active?.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return
    mainRef.current?.focus({ preventScroll: true })
  }, [activePath])

  return (
    <div
      className={cn(
        // `h-dvh`, never the static `screen` height utility. Tailwind's `screen` is
        // `100vh` — the LARGE viewport, i.e. the height the page would have if the
        // browser chrome were fully retracted. Mobile browsers draw the address bar and
        // toolbar OVER that box, so a static-viewport shell puts its own bottom edge
        // behind browser UI, and because the shell is `overflow-hidden` the document
        // cannot scroll to reveal it: the bottom of the app is simply unreachable.
        // `dvh` measures what is actually visible. Enforced by VU001. (The old utility
        // is named in prose, not spelled literally: Tailwind's extractor is a plain-text
        // scan that does not skip comments, so writing it would recompile it back in.)
        'relative flex h-dvh flex-col overflow-hidden bg-page md:flex-row',
        heroActive && 'isolate',
      )}
    >
      {/* Skip-to-content link: the FIRST focusable element in the shell, visually
          hidden until focused (sr-only -> focus:not-sr-only). Lets keyboard users
          bypass the SideNav and jump straight to <main> (#main-content) — WCAG 2.4.1
          Bypass Blocks. Chrome is semantic-token only; it is positioned on focus so
          it never affects layout while hidden. */}
      <a
        href="#main-content"
        className="sr-only type-button fg-default focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-container focus:border focus:border-alpha-subtle focus:bg-surface-flat focus:px-4 focus:py-2 focus:shadow-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        Saltar al contenido
      </a>
      {heroActive ? <DaytimeHero moment={moment} scrollerRef={mainRef} /> : null}
      {/* THE frosted band (mobile) — ONE layer of glass for the whole floating-header
          zone: the nav pill AND, when it is up, the pinned KPI strip. Page content
          scrolls under it; it fades in once scrolled (transparent while atTop) and
          dissolves at its lower edge (`mask-fade-down`, last 32px) so it melts into the
          page instead of cutting off with a hard rule.

          It is ONE element on purpose. The pill and the strip used to carry a frosted
          band each, and two `backdrop-filter` boxes can never be made to look like one:
          each blurs ONLY the backdrop inside its own box, so at their shared edge the
          blur kernel is clipped on both sides and a seam shows — no amount of matching
          the tint or the geometry removes it. (Overlapping them is worse still: the
          backdrop is then blurred twice and tinted twice, 23% + 23% ≈ 41% black, which
          is why the glass around the nav once read darker and dirtier than the glass
          around the cards.) The strip no longer paints glass at all; it just reports
          that it is pinned, via `@/app/lib/kpi-pinned`, and this band grows to cover it.

          Placement is load-bearing:
          - It is a sibling of the <header>, NOT a child, because the header auto-hides
            with a `translate-y` and the glass must stay put while the strip is pinned.
          - `z-[29]` sits BELOW the KPI strip portal (`z-30`) and BELOW the pill's header
            (`z-[35]`), so both paint sharply on top of it, and ABOVE the in-flow
            MainContent, so page content blurs under it. Staying under 30 is what makes
            it correct on a NON-isolated route: today every KPI strip lives on the
            daytime dashboard, whose shell root is `isolate`d (so the body-level strip
            portal already outranks everything here), but on a route without the hero
            there is no isolation and a z above 30 would paint the glass OVER the cards. */}
      <div
        aria-hidden
        className={cn(
          // `pointer-events-none` is load-bearing, not hygiene: this is a full-width box up
          // to 136px tall that exists ONLY to paint. `opacity-0` and `aria-hidden` do not
          // remove a box from hit-testing, so without this it silently eats every tap in the
          // top band — worst while it is fully transparent and the nav has auto-hidden, where
          // the user sees bare content and nothing under their finger responds.
          'pointer-events-none absolute inset-x-0 top-0 z-[29] bg-overlay-subtle backdrop-blur-[var(--overlay-blur)] mask-fade-down motion-glass md:hidden',
          // Height = exactly the zone it must cover. `mask-fade-down` keeps the glass
          // SOLID up to `height - 32px` and dissolves over that last 32px, so each of
          // these is "the bottom of what I am frosting, plus the 32px it takes to
          // vanish". Nothing solid may hang past the zone — that is what made the frost
          // read as bigger than the nav on a page with no strip.
          //   unpinned      -> 58px header  + 32px dissolve =  90px (h-22.5)
          //   pinned        -> 136px strip  + …             = 136px (h-34), the strip's
          //                    own bottom edge; the dissolve runs over the cards' lower
          //                    half exactly as the strip's own band used to.
          //   pinned, nav hidden -> the strip slides up into the nav's place -> 74px.
          // These are measured, not derived: the header is 58px, NOT the 62px the strip
          // reserves for it in `pt-15.5` (a pre-existing 4px over-reserve — do not
          // propagate it here).
          kpiPinned ? (navHidden ? 'h-18.5' : 'h-34') : 'h-22.5',
          // Visible only once scrolled, and only while something is up there to frost:
          // the nav, or a pinned strip that outlives it. Without the pinned clause the
          // glass would vanish from under the cards the moment the nav auto-hid.
          !atTop && (!navHidden || kpiPinned) ? 'opacity-100' : 'opacity-0',
        )}
      />
      {/* Mobile top nav (md:hidden): a compact pill that FLOATS over the content. The
          <header> is an absolute overlay (top-0, z-[35] — above the pinned KPI strip
          portal z-30 so the pill stays sharp on top of its frosted backdrop, and below
          the drawer scrim z-40) so MainContent fills the full height and scrolls underneath it
          (MainContent adds a matching mobile top inset so the first content clears the
          pill). It AUTO-HIDES on scroll: slides up (`-translate-y-full`) on scroll-down
          and returns (`translate-y-0`) on scroll-up, on the panel cadence with the shared
          in/out easing token (same philosophy as the SideNav drawer slide), stripped under
          reduced motion.
          The wrapper is transparent and only insets the pill (pt-2 pb-0 pl-2 pr-2); the pill
          is CHROME-LESS at the top (no fill, transparent border, no shadow — only the menu
          button + logo float over the content) and, once content scrolls under it, gains a
          page-colored fill (bg-page) + alpha-subtle border + subtle shadow (transitioned via
          motion-standard). */}
      {/* `pointer-events-none` on the <header> + `pointer-events-auto` on the pill: the
          header is `inset-x-0` (full width) but the pill it holds is `w-fit`, so everything
          to the RIGHT of the pill is transparent header padding that would otherwise
          intercept taps on the content beneath it. Only the pill is chrome; the rest of the
          line belongs to the page. */}
      <header
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-[35] pt-2 pb-0 pl-2 pr-2 transition-[translate] duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-in-out)] motion-reduce:transition-none md:hidden',
          navHidden ? '-translate-y-full' : 'translate-y-0',
        )}
      >
        {/* Single nav pill: ONE rounded container holding the leading nav zone
            (drawer trigger + context label) and the trailing page-actions zone (the
            slot a page's PageHeader portals its primary action + overflow menu into).
            It HUGS its content by default (`w-fit`) so pages without header actions
            stay compact, and stretches to the full nav line (`w-full`) only when a
            page fills the actions slot (`has-[[data-page-actions]:not(:empty)]:w-full`)
            — then the actions pin to the trailing edge while the label truncates first
            (`min-w-0` leading zone vs `shrink-0` actions). Contextual chrome lives
            ONCE on the whole pill: bare at the top (`bg-alpha-transparent` +
            `border-alpha-transparent` + `shadow-none` — only the ham + logo float over
            the content) and `bg-surface-flat` + `border-alpha-subtle` + `shadow-subtle`
            once content scrolls under it (constant 1px border, only the color toggles, so
            revealing elevation never shifts layout). The revealed fill is the same lifted
            surface the KPI tab cards wear (`bg-surface-flat`, NOT the page ground): the
            pill floats beside them, so a page-gray chip next to white cards read as two
            different whites. Trailing padding is `pr-4` when the title
            is the last thing in the pill, tightened to `pr-2` when the actions zone
            (which carries its own icon-button padding) sits at the edge. */}
        <div
          className={cn(
            'pointer-events-auto flex w-fit max-w-full items-center justify-between gap-3 rounded-container border py-2 pl-2 pr-4 motion-standard has-[[data-page-actions]:not(:empty)]:w-full has-[[data-page-actions]:not(:empty)]:pr-2',
            atTop ? 'bg-alpha-transparent border-alpha-transparent shadow-none' : 'bg-surface-flat border-alpha-subtle shadow-subtle',
          )}
        >
          {/* Leading nav zone: drawer trigger + context label (wordmark at top,
              page title once scrolled). `min-w-0` so a long title truncates instead
              of shoving the trailing actions off the line. */}
          <div className="flex min-w-0 items-center gap-3">
            <IconButton
              variant="transparent"
              color="primary"
              size="dense"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
            >
              <AFFORDANCE.mobileNav className="size-5" aria-hidden />
            </IconButton>
            {/* At the top the page <h1> is in view, so the pill keeps the brand
                wordmark; once scrolled (revealed on scroll-up, away from the heading)
                it shows the page title for context. The dashboard is the exception: its
                <h1> is a time-of-day greeting ("Buenas tardes…"), useless as scrolled
                context, so the dashboard pill keeps the brand in both states. */}
            {atTop || activePath === DAYTIME_ROUTE ? (
              <BrandLogo variant="full" className="h-5 w-auto" />
            ) : (
              <span className="min-w-0 truncate fg-default type-heading">{pageTitle || 'Kivan'}</span>
            )}
          </div>
          {/* Trailing page-actions zone: the slot a page's PageHeader portals its
              primary action + overflow menu into on mobile. `empty:hidden` so it
              reserves no gap on pages without header actions (the pill then hugs the
              leading zone); `shrink-0` so the label truncates first. The shell owns
              the pill chrome + elevation; PageHeader owns the dense controls inside.
              `data-page-actions` is the hook the pill's `:has()` width/padding keys
              off to know when the slot is filled. */}
          <div
            ref={setActionsSlot}
            data-page-actions
            className="flex shrink-0 items-center gap-1 empty:hidden"
          />
        </div>
      </header>

      {/* Backdrop scrim (mobile only). Same scrim recipe as the modal overlay
          (`bg-overlay-default` + `backdrop-blur-[var(--overlay-blur)]` + `backdrop-grayscale`)
          so the mobile nav reads as a blocking surface that drains the page's color,
          consistent with Dialog/AlertDialog/Sheet. Kept mounted so it can fade with the
          drawer: opacity + pointer-events toggle on the panel cadence (not the modal's
          quick cadence) to stay in sync with the SideNav slide. Inert when closed
          (opacity-0 + pointer-events-none). */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-overlay-default backdrop-blur-[var(--overlay-blur)] backdrop-grayscale transition-opacity duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-in-out)] motion-reduce:transition-none md:hidden',
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden
        onClick={() => setDrawerOpen(false)}
      />

      <SideNav
        items={navItems}
        footerItems={footerNavItems}
        activePath={activePath}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        collapsed={railCollapsed}
        onToggleCollapse={() => setRailCollapsed((collapsed) => !collapsed)}
        onNew={onNew}
        newActions={newActions}
        user={user}
      />

      <PageActionsSlotContext.Provider value={actionsSlot}>
        <MainContent ref={mainRef} transparent={heroActive}>{children}</MainContent>
      </PageActionsSlotContext.Provider>
    </div>
  )
}
