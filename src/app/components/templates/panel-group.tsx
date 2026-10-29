import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { cn } from '@/app/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@/app/components/components'
import {
  PanelPositionContext,
  PanelInlineBreakpointContext,
  PANEL_MIN_FIT,
  type PanelPosition,
  type PanelProps,
  type PanelInlineBreakpoint,
} from './panel'

export type PanelGroupLayout = 'stacked' | 'inline'

export type PanelGroupProps = {
  children: ReactNode
  layout?: PanelGroupLayout
  inlineAt?: PanelInlineBreakpoint
  fill?: boolean
  onOverflowDismiss?: () => void
  overflowTitle?: string
}

const STACKED = 'flex flex-col gap-4 md:gap-6'

const INLINE_AT: Record<PanelInlineBreakpoint, string> = {
  lg: 'flex flex-col gap-4 md:gap-6 lg:flex-row lg:flex-wrap lg:gap-0',
  xl: 'flex flex-col gap-4 md:gap-6 xl:flex-row xl:flex-wrap xl:gap-0',
}

const FILL_AT: Record<PanelInlineBreakpoint, string> = {
  lg: 'lg:min-h-0 lg:flex-1 lg:flex-nowrap',
  xl: 'xl:min-h-0 xl:flex-1 xl:flex-nowrap',
}

const OVERFLOW_QUERY: Record<PanelInlineBreakpoint, string> = {
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
}

function positionAt(index: number, count: number): PanelPosition {
  if (count <= 1) return 'only'
  if (index === 0) return 'first'
  if (index === count - 1) return 'last'
  return 'middle'
}

function panelKey(panel: ReactNode, index: number): string | number {
  return isValidElement(panel) ? panel.key ?? index : index
}

function useFittingCount(
  enabled: boolean,
  minFits: number[],
  query: string,
): { ref: RefObject<HTMLDivElement>; fittingCount: number } {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  const [atBreakpoint, setAtBreakpoint] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const mq = window.matchMedia(query)
    const sync = () => setAtBreakpoint(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [enabled, query])

  useEffect(() => {
    if (!enabled) return
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled])

  let fittingCount = minFits.length
  if (enabled && atBreakpoint && width !== null) {
    let sum = 0
    fittingCount = 0
    for (let i = 0; i < minFits.length; i++) {
      const next = sum + minFits[i]
      if (i === 0 || next <= width) {
        sum = next
        fittingCount = i + 1
      } else {
        break
      }
    }
    fittingCount = Math.max(fittingCount, Math.min(minFits.length, 2))
  }
  return { ref, fittingCount }
}

export function PanelGroup({
  children,
  layout = 'stacked',
  inlineAt = 'lg',
  fill = false,
  onOverflowDismiss,
  overflowTitle = 'Panel',
}: PanelGroupProps) {
  const panels = Children.toArray(children)
  const minFits = panels.map((panel) =>
    PANEL_MIN_FIT[(isValidElement<PanelProps>(panel) && panel.props.type) || 'fill'],
  )
  const overflowEnabled = layout === 'inline' && fill
  const { ref, fittingCount } = useFittingCount(overflowEnabled, minFits, OVERFLOW_QUERY[inlineAt])

  const className = cn(layout === 'inline' ? INLINE_AT[inlineAt] : STACKED, fill && FILL_AT[inlineAt])

  if (layout !== 'inline') {
    return <div className={className}>{children}</div>
  }

  const inFlow = panels.slice(0, fittingCount)
  const overflow = panels.slice(fittingCount)
  const hasOverflow = overflow.length > 0

  return (
    <PanelInlineBreakpointContext.Provider value={inlineAt}>
      <div ref={ref} className={className}>
        {inFlow.map((panel, index) => (
          <PanelPositionContext.Provider key={panelKey(panel, index)} value={positionAt(index, inFlow.length)}>
            {panel}
          </PanelPositionContext.Provider>
        ))}
        <Sheet open={hasOverflow} onOpenChange={(open) => (open ? undefined : onOverflowDismiss?.())}>
          <SheetContent side="bottom" aria-describedby={undefined}>
            <SheetTitle className="sr-only">{overflowTitle}</SheetTitle>
            {overflow.map((panel, index) => (
              <PanelPositionContext.Provider key={panelKey(panel, index)} value="only">
                {panel}
              </PanelPositionContext.Provider>
            ))}
          </SheetContent>
        </Sheet>
      </div>
    </PanelInlineBreakpointContext.Provider>
  )
}
