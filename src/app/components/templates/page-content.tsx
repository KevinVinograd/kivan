import type { ReactNode } from 'react'
import { cn } from '@/app/lib/utils'

/**
 * Density of the page rhythm (the inter-block `gap` and the matching bottom
 * gutter). Undefined = the responsive ramp (the default): 16px on tablet/laptop,
 * stepping up to 24px at the `desktop` breakpoint (1440px). The prop pins a FLAT
 * tier at every viewport: `comfortable` = 24px everywhere, `dense` = 16px
 * everywhere.
 */
export type PageDensity = 'comfortable' | 'dense'

export type PageContentProps = {
  children: ReactNode
  density?: PageDensity
}

/**
 * Page rhythm gap + trailing-gutter classes per density. The `after:` spacer's
 * negative margin cancels this column's own trailing `gap`, and its height sets
 * the viewport-floor gutter, so BOTH must track the gap tier (net clearance =
 * the gutter height). The responsive default ramps 16px → 24px at `desktop`.
 */
const DENSITY: Record<PageDensity | 'responsive', string> = {
  responsive: 'gap-4 desktop:gap-6 after:-mt-4 after:h-4 desktop:after:-mt-6 desktop:after:h-6',
  dense: 'gap-4 after:-mt-4 after:h-4',
  comfortable: 'gap-6 after:-mt-6 after:h-6',
}

/**
 * Wraps all page body content below the PageHeader. Provides vertical rhythm
 * between one or more PanelGroups and fills the available height (`flex-1
 * min-h-0`) so a height-bounded child (a master-detail split) can size to the
 * viewport and scroll internally; taller pages overflow to the MainContent
 * scroller. Carries a `pt-4` top inset and OWNS the 24px bottom gutter that
 * clears the viewport floor uniformly on every page — bounded or scrolling —
 * without stealing panel height.
 *
 * The gutter is a trailing `after:` spacer (a flex item), NOT padding: the
 * MainContent `<main>` is a flex column that is also the scroll container, and
 * such a container drops its own `padding-bottom` at scroll-end; padding on a
 * height-bounded ancestor whose content overflows it is dropped too. Only a
 * spacer that is a flex *item* in the SAME flow as the content rides at the true
 * content bottom in both cases. `after:-mt-6` cancels this column's own `gap-6`
 * (which would otherwise add a second 24px between the last panel and the
 * spacer) so the net clearance stays exact — the `after:-mt-*` MUST track the
 * `gap-*` tier (see `DENSITY`). The default is a responsive ramp (16px →
 * 24px at the `desktop` breakpoint); the `density` prop pins a flat tier at every
 * viewport. Holds no width or surface styling of its own.
 */
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
