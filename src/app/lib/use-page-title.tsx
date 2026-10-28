import { createContext, useContext, useState, type ReactNode } from 'react'

/**
 * Publishes the active page's title (the L1 PageHeader `<h1>`) so chrome rendered
 * ABOVE the routed page can mirror it. The mobile AppShell pill is the first
 * consumer: on scroll-up it reveals the page title instead of the brand wordmark,
 * giving the user context of where they are. PageHeader is the single writer
 * (one PageHeader per page, the existing L1 invariant); App reads the value and
 * forwards it to AppShell.
 *
 * Two contexts (value + setter) keep the writer cheap: the setter identity is the
 * stable `useState` updater, so PageHeader never re-renders when the title
 * changes — only readers (App) do. Both contexts ship safe defaults (null title,
 * no-op setter) so a PageHeader rendered outside the provider (tests, stories,
 * standalone screens) degrades gracefully instead of throwing.
 */
const PageTitleValueContext = createContext<string | null>(null)
const PageTitleSetContext = createContext<(title: string | null) => void>(() => {})

export function PageTitleProvider({ children }: { children: ReactNode }) {
  // The `useState` updater is stable across renders, so it can be exposed as the
  // setter context value directly — writers never re-render on title changes.
  const [title, setTitle] = useState<string | null>(null)

  return (
    <PageTitleSetContext.Provider value={setTitle}>
      <PageTitleValueContext.Provider value={title}>{children}</PageTitleValueContext.Provider>
    </PageTitleSetContext.Provider>
  )
}

/** Read the active page title. `null` until a PageHeader publishes one. */
export function usePageTitle(): string | null {
  return useContext(PageTitleValueContext)
}

/** Get the stable setter that publishes the active page title. */
export function useSetPageTitle(): (title: string | null) => void {
  return useContext(PageTitleSetContext)
}
