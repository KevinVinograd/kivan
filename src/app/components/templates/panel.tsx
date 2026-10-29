import { createContext, useContext, type ReactNode } from 'react'
import { cn } from '@/app/lib/utils'

export type PanelType = 'fill' | 'medium' | 'compact' | 'aside'

export type PanelPosition = 'only' | 'first' | 'middle' | 'last'

export const PanelPositionContext = createContext<PanelPosition>('only')

export type PanelInlineBreakpoint = 'lg' | 'xl'
export const PanelInlineBreakpointContext = createContext<PanelInlineBreakpoint>('lg')

export type PanelProps = {
  type?: PanelType
  children: ReactNode
}

const TYPE: Record<PanelType, string> = {
  fill: 'flex-1 min-w-0',
  medium: 'flex-1 min-w-0',
  compact: 'grow-0 shrink basis-[360px] min-w-[320px] max-w-[360px]',
  aside: 'flex-[0.5_1_0%] min-w-[320px]',
}

export const PANEL_MIN_FIT: Record<PanelType, number> = {
  fill: 360,
  medium: 400,
  compact: 320,
  aside: 320,
}

export function Panel({ type = 'fill', children }: PanelProps) {
  const inlineBreakpoint = useContext(PanelInlineBreakpointContext)

  const content =
    type === 'medium' ? (
      <div className="mx-auto flex min-h-0 w-full max-w-[600px] flex-1 flex-col">{children}</div>
    ) : (
      children
    )

  return (
    <section
      data-type={type}
      className={cn('flex flex-col', inlineBreakpoint === 'xl' ? 'xl:min-h-0' : 'lg:min-h-0', TYPE[type])}
    >
      {content}
    </section>
  )
}
