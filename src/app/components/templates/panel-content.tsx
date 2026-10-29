import { forwardRef, useContext, type ReactNode } from 'react'
import { cn } from '@/app/lib/utils'
import { motionClass, type MotionPreset } from '@/app/lib/motion'
import {
  PanelInlineBreakpointContext,
  PanelPositionContext,
  type PanelInlineBreakpoint,
  type PanelPosition,
} from './panel'

export type PanelContentLayout = 'stacked' | 'inline' | 'grid'

export type PanelContentDensity = 'comfortable' | 'dense'

export type PanelContentProps = {
  layout?: PanelContentLayout
  density?: PanelContentDensity
  children: ReactNode
  columns?: 1 | 2 | 3 | 4
  flushTop?: boolean
  motion?: MotionPreset
}

const LAYOUT: Record<PanelContentLayout, string> = {
  stacked: 'flex flex-col *:shrink-0',
  inline: 'flex flex-wrap items-center gap-3',
  grid: 'grid',
}

const STACK_GAP: Record<PanelContentDensity | 'responsive', string> = {
  responsive: 'gap-4 desktop:gap-6',
  dense: 'gap-4',
  comfortable: 'gap-6',
}

const GRID_COLUMNS: Record<1 | 2 | 3 | 4, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
}

const HORIZONTAL: Record<PanelInlineBreakpoint, Record<PanelPosition, string>> = {
  lg: {
    only: 'px-4 md:px-6 lg:px-8 desktop:px-10',
    first: 'px-4 md:px-6 lg:pl-8 lg:pr-5 desktop:pl-10',
    middle: 'px-4 md:px-6 lg:px-5',
    last: 'px-4 md:px-6 lg:pl-5 lg:pr-8 desktop:pr-10',
  },
  xl: {
    only: 'px-4 md:px-6 lg:px-8 desktop:px-10',
    first: 'px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10',
    middle: 'px-4 md:px-6 lg:px-8 xl:px-5',
    last: 'px-4 md:px-6 lg:px-8 xl:pl-5 desktop:pr-10',
  },
}

export const PanelContent = forwardRef<HTMLDivElement, PanelContentProps>(function PanelContent(
  { layout = 'stacked', density, columns = 3, flushTop = false, motion = 'panel-enter', children },
  ref,
) {
  const position = useContext(PanelPositionContext)
  const inlineBreakpoint = useContext(PanelInlineBreakpointContext)
  return (
    <div
      ref={ref}
      className={cn(
        'min-h-0 flex-1 overflow-y-auto pb-4',
        flushTop ? 'pt-0' : 'pt-4',
        HORIZONTAL[inlineBreakpoint][position],
        LAYOUT[layout],
        layout !== 'inline' && STACK_GAP[density ?? 'responsive'],
        layout === 'grid' && GRID_COLUMNS[columns],
        motionClass(motion),
      )}
    >
      {children}
    </div>
  )
})
