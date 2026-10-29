import { useEffect, useRef } from 'react'

import { Tabs, TabsList, TabsTrigger } from '@/app/components/components'
import { SectionHeader } from '@/app/components/templates'
import { hasCapability, type Capability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { useScrollMask } from '@/app/lib/use-scroll-mask'
import { cn } from '@/app/lib/utils'

export type ReportTab = 'resumen' | 'productividad' | 'rentabilidad' | 'carga' | 'finanzas'

const TABS: { value: ReportTab; label: string }[] = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'productividad', label: 'Productividad' },
  { value: 'rentabilidad', label: 'Rentabilidad' },
  { value: 'carga', label: 'Carga de equipo' },
  { value: 'finanzas', label: 'Finanzas operativas' },
]

const TAB_CAPABILITY: Partial<Record<ReportTab, Capability>> = {
  rentabilidad: 'profitability',
  finanzas: 'studioFinancials',
}

export function isReportTabAllowed(tab: ReportTab, capabilities: Capability[]): boolean {
  const required = TAB_CAPABILITY[tab]
  return required == null || hasCapability(capabilities, required)
}

const DRAG_THRESHOLD = 6

export function ReportsTabsHeader({
  activeTab,
  onTabChange,
}: {
  activeTab: ReportTab
  onTabChange: (tab: ReportTab) => void
}) {
  const { capabilities } = useRole()
  const tabs = TABS.filter((tab) => isReportTabAllowed(tab.value, capabilities))
  const scrollRef = useRef<HTMLDivElement>(null)
  const maskClass = useScrollMask(scrollRef, true, 24)
  const hasOverflow = maskClass !== ''
  const drag = useRef({ down: false, moved: false, startX: 0, startScroll: 0, pointerId: -1 })

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const active = container.querySelector<HTMLElement>(
      '[data-slot="tabs-trigger"][data-state="active"]',
    )
    if (!active) return
    const containerRect = container.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    const delta = activeRect.left - containerRect.left - (container.clientWidth - activeRect.width) / 2
    container.scrollBy({ left: delta })
  }, [activeTab])

  const onMouseDownCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button === 0 && !event.ctrlKey && !event.metaKey) event.preventDefault()
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const el = scrollRef.current
    if (!el) return
    drag.current = {
      down: true,
      moved: false,
      startX: event.clientX,
      startScroll: el.scrollLeft,
      pointerId: event.pointerId,
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    const el = scrollRef.current
    if (!state.down || !el) return
    const dx = event.clientX - state.startX
    if (!state.moved && Math.abs(dx) > DRAG_THRESHOLD) {
      state.moved = true
      el.setPointerCapture(state.pointerId)
    }
    if (state.moved) el.scrollLeft = state.startScroll - dx
  }

  const endDrag = () => {
    const state = drag.current
    const el = scrollRef.current
    if (el && state.moved && el.hasPointerCapture(state.pointerId)) {
      el.releasePointerCapture(state.pointerId)
    }
    state.down = false
  }

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (drag.current.moved) return
    const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-slot="tabs-trigger"]')
    const value = trigger?.dataset.value
    if (!value || trigger?.getAttribute('aria-disabled') === 'true') return
    onTabChange(value as ReportTab)
    trigger?.focus()
  }

  return (
    <SectionHeader
      variant="control"
      title="Reportes"
      leading={
        <div
          ref={scrollRef}
          role="region"
          aria-label="Navegación de reportes"
          onMouseDownCapture={onMouseDownCapture}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={onClick}
          className={cn(
            'min-w-0 cursor-grab touch-pan-x overflow-x-auto select-none active:cursor-grabbing',
            '[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-alpha-emphasis [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-alpha-subtle',
            hasOverflow && 'md:-mt-1 md:pt-1 md:pb-2',
            maskClass,
          )}
        >
          <Tabs
            value={activeTab}
            onValueChange={(value) => onTabChange(value as ReportTab)}
            activationMode="manual"
          >
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} data-value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      }
    />
  )
}
