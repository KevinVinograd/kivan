import { type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/app/components/components'
import type { Icon } from '@/app/lib/icon-registry'
import { useIsMobile } from '@/app/lib/use-is-mobile'

export type PreviewSurfaceProps = {
  /** Inline trigger control; wrapped with Radix `asChild` so focus/tap opens it. */
  trigger: ReactNode
  /** Accessible name for the tap-driven mobile bottom sheet (visually hidden). */
  title: string
  content: ReactNode
  /** HoverCard horizontal alignment (desktop only). */
  align?: 'start' | 'center' | 'end'
  /** Desktop HoverCard width/layout override. Defaults to `w-64`. */
  contentClassName?: string
}

/**
 * Shared hover-preview surface: a desktop HoverCard, or a tap-driven bottom sheet
 * on mobile (≤767px via `useIsMobile`, where hover does not exist), reusing the
 * responsive `Dialog` — which docks to the bottom edge as a slide-up sheet on
 * mobile. The single source of the hover-vs-tap scaffold — the team-member,
 * invoice, payment and risk-client previews compose it instead of each repeating
 * the branch.
 */
export function PreviewSurface({
  trigger,
  title,
  content,
  align = 'start',
  contentClassName = 'w-64',
}: PreviewSurfaceProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Dialog>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {content}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent align={align} className={contentClassName}>
        {content}
      </HoverCardContent>
    </HoverCard>
  )
}

/** Icon + single-line text row used inside preview bodies. */
export function PreviewInfoRow({ icon: Glyph, children }: { icon: Icon; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Glyph className="size-4 shrink-0 fg-subtle" aria-hidden />
      <span className="min-w-0 truncate type-body-2 fg-default">{children}</span>
    </div>
  )
}
