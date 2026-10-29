import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/app/lib/utils'
import { TabsList } from '@/app/components/components'
import { KpiTabCard, kpiTabFg } from './kpi-tab-card'
import { useScrollMask } from '@/app/lib/use-scroll-mask'
import { useOffscreenAbove } from '@/app/lib/use-offscreen-above'
import { useScrollDirectionWithin } from '@/app/lib/use-scroll-direction'
import { setKpiPinned } from '@/app/lib/kpi-pinned'

export const COMPACT_STRIP =
  'flex gap-3 overflow-x-auto touch-pan-x px-4 py-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-alpha-emphasis [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-alpha-subtle'

export type PinnedKpiItem = {
  id: string
  label: string
  value: string
  valueToneClass: string
}

export function MobileKpiStrip({
  triggers,
  items,
  selectedId,
  onSelect,
  label,
  stripClassName,
}: {
  triggers: ReactNode
  items: PinnedKpiItem[]
  selectedId: string
  onSelect: (id: string) => void
  label: string
  stripClassName?: string
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const maskClass = useScrollMask(railRef)
  const pinned = useOffscreenAbove(railRef)
  const { hidden: navHidden } = useScrollDirectionWithin(railRef)
  useEffect(() => {
    setKpiPinned(pinned)
    return () => setKpiPinned(false)
  }, [pinned])
  return (
    <>
      <TabsList variant="naked" asChild>
        <div ref={railRef} className={cn(COMPACT_STRIP, maskClass, stripClassName)}>
          {triggers}
        </div>
      </TabsList>
      <KpiPinnedStrip
        items={items}
        selectedId={selectedId}
        onSelect={onSelect}
        visible={pinned}
        navHidden={navHidden}
        label={label}
      />
    </>
  )
}

function KpiPinnedStrip({
  items,
  selectedId,
  onSelect,
  visible,
  navHidden,
  label,
}: {
  items: PinnedKpiItem[]
  selectedId: string
  onSelect: (id: string) => void
  visible: boolean
  navHidden: boolean
  label: string
}) {
  if (typeof document === 'undefined') return null

  const activate = (id: string) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(id)
    }
  }

  return createPortal(
    <div
      role="group"
      aria-label={label}
      aria-hidden={!visible}
      className={cn(
        'fixed inset-x-0 top-0 z-30 md:hidden',
        navHidden ? 'pt-0' : 'pt-15.5',
        'transition-[padding,opacity,transform] duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-in-out)] motion-reduce:transition-none',
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none',
      )}
    >
      <div className={COMPACT_STRIP}>
        {items.map((item) => {
          const selected = item.id === selectedId
          return (
            <KpiTabCard
              key={item.id}
              selected={selected}
              compact
              className="shrink-0 max-w-[200px]"
              role="button"
              aria-pressed={selected}
              aria-label={item.label}
              tabIndex={visible ? 0 : -1}
              onClick={() => onSelect(item.id)}
              onKeyDown={activate(item.id)}
            >
              <span className={cn('type-caption truncate', kpiTabFg(selected, 'fg-subtle group-hover:fg-default'))}>
                {item.label}
              </span>
              <span className={cn('type-body-2 tabular-nums line-clamp-1', kpiTabFg(selected, item.valueToneClass))}>
                {item.value}
              </span>
            </KpiTabCard>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
