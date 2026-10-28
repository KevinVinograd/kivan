import * as React from 'react'
import { useNavigate } from 'react-router'

import { cn } from '@/app/lib/utils'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { Avatar, AvatarFallback, Badge, Button, Separator } from '@/app/components/components'
import { type Icon } from '@/app/lib/icon-registry'
import { initials } from './cobranza-format'
import { PreviewSurface } from './clients-preview'
import { activityTypeIcon, activityTypeLabel, formatRelativeDate, formatShortDate } from './activity-format'
import type { ActivityEntity, ActivityFeedItem } from './activity-data'

/**
 * Large round leading glyph for the period timeline — a bigger, more prominent
 * variant of the dashboard teaser marker (size-12 ring, size-5 glyph). Local to
 * this component per the design-system repeat-locally policy.
 */
function LeadingIcon({ icon: Glyph }: { icon: Icon }) {
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-alpha-subtle bg-alpha-subtle fg-default">
      <Glyph className="size-5" aria-hidden />
    </span>
  )
}

/**
 * Inline trigger for an entity name; opens the surrounding PreviewSurface.
 *
 * Deliberately raw markup, and deliberately NOT a <button>: a button box is atomic
 * inline-level content, so the browser cannot break a multi-word name across lines —
 * it pushes the whole name onto its own line and leaves the sentence above it ragged.
 * The Button primitive renders a real <button> and exposes no `asChild` to render
 * another tag, so no primitive can express a trigger
 * that flows and breaks like the running text around it. This is the raw-markup
 * escape hatch: a focusable inline span carrying the
 * button role, plus the Enter/Space activation a native button gives for free.
 */
const EntityTrigger = React.forwardRef<HTMLSpanElement, React.ComponentProps<'span'> & { name: string }>(
  function EntityTrigger({ name, className, onKeyDown, ...props }, ref) {
    return (
      <span
        ref={ref}
        role="button"
        tabIndex={0}
        className={cn(
          'cursor-pointer rounded-control fg-default outline-none focus-visible:ring-2 focus-visible:ring-focus',
          className,
        )}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.currentTarget.click()
          }
        }}
        {...props}
      >
        {name}
      </span>
    )
  },
)

/** Team-member preview: name + role, plus Ver perfil into the Equipo detail. */
function MemberPreviewContent({ entity }: { entity: Extract<ActivityEntity, { kind: 'member' }> }) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          <AvatarFallback>{initials(entity.name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="truncate type-heading fg-default">{entity.name}</span>
          <span className="truncate type-body-2 fg-subtle">{entity.role}</span>
        </div>
      </div>
      <Separator />
      <Button
        variant="outlined"
        color="primary"
        size="dense"
        onClick={() => navigate(buildTrailHref(`/team?open=${entity.id}`, { label: 'Dashboard', to: '/dashboard' }, new URLSearchParams()))}
      >
        Ver perfil
      </Button>
    </div>
  )
}

/** Client preview: name, plus Ver perfil into the Clientes detail. */
function ClientPreviewContent({ entity }: { entity: Extract<ActivityEntity, { kind: 'client' }> }) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-3">
      <span className="type-heading fg-default">{entity.name}</span>
      <Button
        variant="outlined"
        color="primary"
        size="dense"
        onClick={() => navigate(buildTrailHref(`/clients?open=${entity.id}`, { label: 'Dashboard', to: '/dashboard' }, new URLSearchParams()))}
      >
        Ver perfil
      </Button>
    </div>
  )
}

/** Renders one entity: hover link-text for clients/members, plain for the rest.
 *  Non-clickable names read `fg-subtle` so the clickable ones (fg-default) stand out. */
function ActivityEntityRef({ entity }: { entity: ActivityEntity }) {
  if (entity.kind === 'plain') {
    return <span className="fg-subtle">{entity.name}</span>
  }
  if (entity.kind === 'client') {
    return (
      <PreviewSurface
        trigger={<EntityTrigger name={entity.name} />}
        title={entity.name}
        content={<ClientPreviewContent entity={entity} />}
      />
    )
  }
  return (
    <PreviewSurface
      trigger={<EntityTrigger name={entity.name} />}
      title={entity.name}
      content={<MemberPreviewContent entity={entity} />}
    />
  )
}

function TimelineRow({ item, isLast }: { item: ActivityFeedItem; isLast: boolean }) {
  return (
    <div className="flex gap-4">
      {/* Leading icon + the prominent connector linking each entry to the next. */}
      <div className="flex flex-col items-center gap-2">
        <LeadingIcon icon={activityTypeIcon(item.type)} />
        {!isLast ? <span aria-hidden className="w-0.5 flex-1 rounded-full bg-alpha-emphasis" /> : null}
      </div>
      <div className={cn('flex min-w-0 flex-1 flex-col gap-1', !isLast && 'pb-6')}>
        {/* The sentence owns the full column width — both dates sit on the meta row
            below it, so nothing competes for the line and the text wraps as prose.
            fg-subtle so the connecting verb phrase and any plain names recede;
            clickable client/member names keep fg-default and pop. */}
        <p className="type-body fg-subtle">
          <ActivityEntityRef entity={item.actor} /> {item.action} <ActivityEntityRef entity={item.context} />
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{activityTypeLabel(item.type)}</Badge>
          {/* Each date is its own non-breaking unit. In the 1/3-width desktop drawer the
              text column is ~211px at 1024px, so the pair does not fit on one line — it
              may wrap between the dates, but must never split one mid-value ("11 jul" /
              "2026"). */}
          <span className="type-caption fg-subtle">
            <span className="whitespace-nowrap">{formatRelativeDate(item.iso)}</span>
            {' · '}
            <span className="whitespace-nowrap">{formatShortDate(item.iso)}</span>
          </span>
        </div>
        {item.detail ? <p className="type-body-2 fg-subtle">{item.detail}</p> : null}
      </div>
    </div>
  )
}

/**
 * The full activity log as a prominent vertical timeline: a large kind-icon per
 * entry, a bold connecting line, an action-type badge, the exact + relative date
 * and an optional enrichment line. Client/team-member names are hover link-text
 * with a preview + "Ver perfil"; entries without a profile page (a production)
 * render as plain text. Read-only.
 */
export function ActivityTimeline({ items }: { items: ActivityFeedItem[] }) {
  return (
    <div className="flex flex-col">
      {items.map((item, index) => (
        <TimelineRow key={item.id} item={item} isLast={index === items.length - 1} />
      ))}
    </div>
  )
}
