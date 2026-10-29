import type { ReactNode } from 'react'
import { cn } from '@/app/lib/utils'

export type PageDensity = 'comfortable' | 'dense'

export type PageContentProps = {
  children: ReactNode
  density?: PageDensity
}

const DENSITY: Record<PageDensity | 'responsive', string> = {
  responsive: 'gap-4 desktop:gap-6 after:-mt-4 after:h-4 desktop:after:-mt-6 desktop:after:h-6',
  dense: 'gap-4 after:-mt-4 after:h-4',
  comfortable: 'gap-6 after:-mt-6 after:h-6',
}

export function PageContent({ children, density }: PageContentProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col pt-4 after:block after:shrink-0 after:content-['']",
        DENSITY[density ?? 'responsive'],
      )}
    >
      {children}
    </div>
  )
}
