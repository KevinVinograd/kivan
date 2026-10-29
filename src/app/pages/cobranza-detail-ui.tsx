import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/app/lib/utils'
import { isCalendarDay } from '@/app/lib/iso-date'
import { AFFORDANCE, ICON, type Icon } from '@/app/lib/icon-registry'
import { Avatar, AvatarFallback, Card, CardContent, IconButton } from '@/app/components/components'
import { PanelContent, SectionHeader } from '@/app/components/templates'
import { formatRelativeDate, formatShortDate, initials, type ActivityEntry, type ActivityKind } from './cobranza-format'

export function ScrollRevealDetail({
  name,
  subtitle,
  badges,
  breadcrumb,
  controls,
  onClose,
  children,
}: {
  name: string
  subtitle?: string
  badges?: ReactNode
  breadcrumb?: ReactNode
  controls?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    setScrolled(false)
    const root = scrollRef.current
    const hero = heroRef.current
    if (!root || !hero) return
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { root, rootMargin: '-56px 0px 0px 0px', threshold: 0 },
    )
    observer.observe(hero)
    return () => observer.disconnect()
  }, [name])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-20 bg-page transition-opacity duration-[var(--motion-duration-quick)]',
          scrolled ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <SectionHeader
          title={name}
          description={subtitle}
          leading={
            <Avatar size="lg" active>
              <AvatarFallback>{initials(name)}</AvatarFallback>
            </Avatar>
          }
          titleTrailing={badges}
          actions={
            <div className="flex items-center gap-1">
              {controls}
              <IconButton variant="transparent" color="primary" aria-label="Cerrar detalle" onClick={onClose}>
                <AFFORDANCE.close className="size-5" aria-hidden />
              </IconButton>
            </div>
          }
        />
      </div>

      <PanelContent ref={scrollRef} layout="stacked">
        {breadcrumb ? <div className="self-start">{breadcrumb}</div> : null}
        <div ref={heroRef} className="relative flex flex-col items-center gap-4 text-center">
          <div className="absolute top-0 right-0 flex items-center gap-1">
            {controls}
            <IconButton
              variant="transparent"
              color="primary"
              aria-label="Cerrar detalle"
              onClick={onClose}
            >
              <AFFORDANCE.close className="size-5" aria-hidden />
            </IconButton>
          </div>
          <Avatar size="xxl" active>
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <h2 className="type-section fg-default">{name}</h2>
            {subtitle ? <p className="type-body-2 fg-subtle">{subtitle}</p> : null}
          </div>
          {badges ? (
            <span className="flex flex-wrap items-center justify-center gap-1">{badges}</span>
          ) : null}
        </div>
        {children}
      </PanelContent>
    </div>
  )
}

export function CobranzaDetailEmpty({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end px-4 md:px-6 lg:px-8 desktop:px-10 py-3">
        <IconButton variant="transparent" color="primary" aria-label="Cerrar detalle" onClick={onClose}>
          <AFFORDANCE.close className="size-5" aria-hidden />
        </IconButton>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 md:px-6 lg:px-8 desktop:px-10 pb-6">
        <p className="text-center type-body-2 fg-subtle">{label}</p>
      </div>
    </div>
  )
}

export function LeadingIcon({ icon: GlyphIcon }: { icon: Icon }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-alpha-subtle bg-alpha-subtle fg-subtle">
      <GlyphIcon className="size-3.5" aria-hidden />
    </span>
  )
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="type-body-2 fg-subtle">{label}</span>
      <span className="type-body-2 text-right fg-default">{value}</span>
    </div>
  )
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">{title}</h3>
      <Card>
        <CardContent className="flex flex-col gap-1.5">{children}</CardContent>
      </Card>
    </section>
  )
}

const ACTIVITY_ICON: Record<ActivityKind, Icon> = {
  created: AFFORDANCE.create,
  invoice: ICON.invoice,
  sent: ICON.sendStatement,
  collected: ICON.payment,
  paid: ICON.payment,
  approved: ICON.approvePayment,
  reminder: ICON.email,
  note: ICON.feedback,
  cancelled: AFFORDANCE.close,
}

export function ActivityTimeline({ items }: { items: ActivityEntry[] }) {
  if (items.length === 0) {
    return <span className="type-body-2 fg-subtle">Sin actividad</span>
  }
  return (
    <div className="flex flex-col">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <div key={`${item.iso}-${index}`} className="flex gap-3">
            <div className="flex flex-col items-center gap-1">
              <LeadingIcon icon={ACTIVITY_ICON[item.kind]} />
              {!isLast ? <span aria-hidden className="flex-1 border-l border-alpha-subtle" /> : null}
            </div>
            <div
              className={cn(
                'flex min-w-0 flex-1 items-start justify-between gap-3',
                !isLast && 'pb-4',
              )}
            >
              <span className="type-body-2 fg-default">{item.label}</span>
              <span className="whitespace-nowrap type-caption fg-subtle">
                {isCalendarDay(item.iso) ? formatShortDate(item.iso) : formatRelativeDate(item.iso)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
