import { createContext, useContext, useState, type ReactNode } from 'react'

const PageTitleValueContext = createContext<string | null>(null)
const PageTitleSetContext = createContext<(title: string | null) => void>(() => {})

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null)

  return (
    <PageTitleSetContext.Provider value={setTitle}>
      <PageTitleValueContext.Provider value={title}>{children}</PageTitleValueContext.Provider>
    </PageTitleSetContext.Provider>
  )
}

export function usePageTitle(): string | null {
  return useContext(PageTitleValueContext)
}

export function useSetPageTitle(): (title: string | null) => void {
  return useContext(PageTitleSetContext)
}
