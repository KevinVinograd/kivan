import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/app/lib/utils'
import { motionClass } from '@/app/lib/motion'
import { useIsMobile, useIsBelowDesktop } from '@/app/lib/use-is-mobile'
import { Sheet, SheetContent, SheetTitle } from '@/app/components/components'
import { PanelGroup } from './panel-group'
import { Panel } from './panel'

export type MasterDetailLayoutProps = {
  selectedId: string | null
  table: ReactNode
  list: ReactNode
  detail: ReactNode
  detailType?: 'medium' | 'fill'
  mobileDetail?: 'sheet' | 'inline' | 'step'
  mobileEntered?: boolean
  mobileStepHeader?: ReactNode
  onCloseDetail?: () => void
  detailTitle?: string
  onModeChange?: (mode: 'table' | 'split') => void
}

type TransitionPhase = 'table' | 'opening' | 'split' | 'closing'

const PHASE_SETTLE_FALLBACK_MS = 1000

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return reduced
}

export function MasterDetailLayout({
  selectedId,
  table,
  list,
  detail,
  detailType = 'medium',
  mobileDetail = 'sheet',
  mobileEntered = false,
  mobileStepHeader,
  onCloseDetail,
  detailTitle = 'Detalle',
  onModeChange,
}: MasterDetailLayoutProps) {
  const present = selectedId !== null
  const isBelowDesktop = useIsBelowDesktop()
  const isMobile = useIsMobile()
  const prefersReducedMotion = usePrefersReducedMotion()

  const held = useRef<{ list: ReactNode; detail: ReactNode }>({ list, detail })
  if (present) held.current = { list, detail }

  const [phase, setPhase] = useState<TransitionPhase>(present ? 'split' : 'table')
  useEffect(() => {
    if (isBelowDesktop || prefersReducedMotion) {
      setPhase(present ? 'split' : 'table')
      return
    }
    if (present && (phase === 'table' || phase === 'closing')) {
      setPhase('opening')
    } else if (!present && (phase === 'split' || phase === 'opening')) {
      setPhase('closing')
    }
  }, [present, phase, isBelowDesktop, prefersReducedMotion])

  useEffect(() => {
    if (phase !== 'opening' && phase !== 'closing') return
    const timer = window.setTimeout(() => {
      setPhase(phase === 'opening' ? 'split' : 'table')
    }, PHASE_SETTLE_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  const mode: 'table' | 'split' = phase === 'table' ? 'table' : 'split'
  const onModeChangeRef = useRef(onModeChange)
  useEffect(() => {
    onModeChangeRef.current = onModeChange
  })
  useEffect(() => {
    onModeChangeRef.current?.(mode)
  }, [mode])

  if (isBelowDesktop && mobileDetail === 'sheet') {
    const base = isMobile ? list : (table ?? list)
    return (
      <>
        <PanelGroup layout="inline">
          <Panel type="fill">{base}</Panel>
        </PanelGroup>
        <Sheet open={present} onOpenChange={(open) => (open ? undefined : onCloseDetail?.())}>
          <SheetContent side="bottom" aria-describedby={undefined} showCloseButton={false}>
            <SheetTitle className="sr-only">{detailTitle}</SheetTitle>
            <div className="flex min-h-0 flex-1 flex-col">{present ? detail : held.current.detail}</div>
          </SheetContent>
        </Sheet>
      </>
    )
  }

  if (isBelowDesktop && mobileDetail === 'inline') {
    return (
      <PanelGroup layout="stacked">
        <Panel type="fill">{list}</Panel>
        <Panel type="fill">{detail}</Panel>
      </PanelGroup>
    )
  }

  if (isBelowDesktop && mobileDetail === 'step') {
    if (!mobileEntered) {
      return (
        <PanelGroup layout="stacked">
          <Panel type="fill">{list}</Panel>
        </PanelGroup>
      )
    }
    return (
      <PanelGroup layout="stacked">
        <Panel type="fill">
          {mobileStepHeader}
          {detail}
        </Panel>
      </PanelGroup>
    )
  }

  const splitShown = phase === 'opening' || phase === 'split' || phase === 'closing'
  const tableOverlay = phase === 'opening' || phase === 'closing'
  const splitNodes = phase === 'closing' ? held.current : { list, detail }

  return (
    <div className={cn('relative', phase !== 'table' && 'flex min-h-0 flex-1')}>
      {splitShown ? (
        <PanelGroup layout="inline" fill>
          <Panel type="compact">
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col',
                phase === 'opening' && motionClass('md-list-in'),
                phase === 'closing' && motionClass('md-list-out'),
              )}
            >
              {splitNodes.list}
            </div>
          </Panel>
          <Panel type={detailType}>
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col',
                phase === 'opening' && motionClass('md-detail-in'),
                phase === 'closing' && motionClass('md-detail-out'),
              )}
              onAnimationEnd={(event) => {
                if (event.animationName === 'motion-md-detail-in') setPhase('split')
              }}
            >
              {splitNodes.detail}
            </div>
          </Panel>
        </PanelGroup>
      ) : (
        <PanelGroup layout="inline">
          <Panel type="fill">{table}</Panel>
        </PanelGroup>
      )}

      {tableOverlay && (
        <div className="pointer-events-none absolute inset-0 flex">
          <PanelGroup layout="inline" fill>
            <Panel type="fill">
              <div
                className={cn(
                  'flex min-h-0 flex-1 flex-col',
                  phase === 'opening' && motionClass('md-content-out'),
                  phase === 'closing' && motionClass('md-content-in'),
                )}
                onAnimationEnd={(event) => {
                  if (event.animationName === 'motion-md-content-in') setPhase('table')
                }}
              >
                {table}
              </div>
            </Panel>
          </PanelGroup>
        </div>
      )}
    </div>
  )
}
