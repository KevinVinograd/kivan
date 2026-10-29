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

const DAYTIME_ROUTE = '/dashboard'

export type AppShellProps = {
  navItems: NavEntry[]
  footerNavItems?: NavItem[]
  activePath?: string
  pageTitle?: string
  onNew?: () => void
  newActions?: NewAction[]
  user?: NavUser
  children: ReactNode
}

export function AppShell({ navItems, footerNavItems, activePath, pageTitle, onNew, newActions, user, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null)

  const mainRef = useRef<HTMLElement>(null)
  const { hidden: navHidden, atTop } = useScrollDirection(mainRef)
  const kpiPinned = useKpiPinned()

  const { isActive: daytimeActive, moment } = useDaytime()
  const heroActive = daytimeActive && activePath === DAYTIME_ROUTE

  const prevPathRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const prev = prevPathRef.current
    prevPathRef.current = activePath
    if (prev === undefined || prev === activePath) return
    setDrawerOpen(false)
    const active = document.activeElement
    if (active?.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return
    mainRef.current?.focus({ preventScroll: true })
  }, [activePath])

  return (
    <div
      className={cn(
        'relative flex h-dvh flex-col overflow-hidden bg-page md:flex-row',
        heroActive && 'isolate',
      )}
    >
      <a
        href="#main-content"
        className="sr-only type-button fg-default focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-container focus:border focus:border-alpha-subtle focus:bg-surface-flat focus:px-4 focus:py-2 focus:shadow-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        Saltar al contenido
      </a>
      {heroActive ? <DaytimeHero moment={moment} scrollerRef={mainRef} /> : null}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-[29] bg-overlay-subtle backdrop-blur-[var(--overlay-blur)] mask-fade-down motion-glass md:hidden',
          kpiPinned ? (navHidden ? 'h-18.5' : 'h-34') : 'h-22.5',
          !atTop && (!navHidden || kpiPinned) ? 'opacity-100' : 'opacity-0',
        )}
      />
      <header
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-[35] pt-2 pb-0 pl-2 pr-2 transition-[translate] duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-in-out)] motion-reduce:transition-none md:hidden',
          navHidden ? '-translate-y-full' : 'translate-y-0',
        )}
      >
        <div
          className={cn(
            'pointer-events-auto flex w-fit max-w-full items-center justify-between gap-3 rounded-container border py-2 pl-2 pr-4 motion-standard has-[[data-page-actions]:not(:empty)]:w-full has-[[data-page-actions]:not(:empty)]:pr-2',
            atTop ? 'bg-alpha-transparent border-alpha-transparent shadow-none' : 'bg-surface-flat border-alpha-subtle shadow-subtle',
          )}
        >
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
            {atTop || activePath === DAYTIME_ROUTE ? (
              <BrandLogo variant="full" className="h-5 w-auto" />
            ) : (
              <span className="min-w-0 truncate fg-default type-heading">{pageTitle || 'Kivan'}</span>
            )}
          </div>
          <div
            ref={setActionsSlot}
            data-page-actions
            className="flex shrink-0 items-center gap-1 empty:hidden"
          />
        </div>
      </header>

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
