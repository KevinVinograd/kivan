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
  trigger: ReactNode
  title: string
  content: ReactNode
  align?: 'start' | 'center' | 'end'
  contentClassName?: string
}

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

export function PreviewInfoRow({ icon: Glyph, children }: { icon: Icon; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Glyph className="size-4 shrink-0 fg-subtle" aria-hidden />
      <span className="min-w-0 truncate type-body-2 fg-default">{children}</span>
    </div>
  )
}
