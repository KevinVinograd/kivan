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

function LeadingIcon({ icon: Glyph }: { icon: Icon }) {
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-alpha-subtle bg-alpha-subtle fg-default">
      <Glyph className="size-5" aria-hidden />
    </span>
  )
}

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
      <div className="flex flex-col items-center gap-2">
        <LeadingIcon icon={activityTypeIcon(item.type)} />
        {!isLast ? <span aria-hidden className="w-0.5 flex-1 rounded-full bg-alpha-emphasis" /> : null}
      </div>
      <div className={cn('flex min-w-0 flex-1 flex-col gap-1', !isLast && 'pb-6')}>
        <p className="type-body fg-subtle">
          <ActivityEntityRef entity={item.actor} /> {item.action} <ActivityEntityRef entity={item.context} />
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{activityTypeLabel(item.type)}</Badge>
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

export function ActivityTimeline({ items }: { items: ActivityFeedItem[] }) {
  return (
    <div className="flex flex-col">
      {items.map((item, index) => (
        <TimelineRow key={item.id} item={item} isLast={index === items.length - 1} />
      ))}
    </div>
  )
}
