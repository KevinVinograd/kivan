import { forwardRef, type ReactNode } from 'react'
import { cn } from '@/app/lib/utils'

export type MainContentProps = {
  children: ReactNode
  transparent?: boolean
}

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
