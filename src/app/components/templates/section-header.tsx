import { useContext, type ReactNode } from 'react'

import { cn } from '@/app/lib/utils'
import {
  PanelInlineBreakpointContext,
  PanelPositionContext,
  type PanelInlineBreakpoint,
  type PanelPosition,
} from './panel'

export type SectionHeaderVariant = 'default' | 'control'

export type SectionHeaderProps = {
  title: string
  description?: string
  breadcrumb?: ReactNode
  leading?: ReactNode
  titleTrailing?: ReactNode
  actions?: ReactNode
  actionsInline?: boolean
  metadata?: ReactNode
  variant?: SectionHeaderVariant
  inset?: boolean
}

const INSET: Record<PanelInlineBreakpoint, Record<PanelPosition, string>> = {
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

export function SectionHeader({
  title,
  description,
  breadcrumb,
  leading,
  titleTrailing,
  actions,
  metadata,
  variant = 'default',
  inset = true,
  actionsInline = true,
}: SectionHeaderProps) {
  const position = useContext(PanelPositionContext)
  const inlineBreakpoint = useContext(PanelInlineBreakpointContext)
  const rootClass = cn('flex flex-col gap-3 py-3', inset ? INSET[inlineBreakpoint][position] : 'px-0')
  const headerRowClass = cn(
    'flex gap-2',
    actionsInline
      ? 'flex-row items-center justify-between'
      : 'flex-col sm:flex-row sm:items-center sm:justify-between',
  )
  if (variant === 'control') {
    return (
      <div className={rootClass}>
        <div className={headerRowClass}>
          <div className="flex min-w-0 items-center gap-4">
            <h2 className="sr-only">{title}</h2>
            {leading}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>
          ) : null}
        </div>
        {metadata ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 type-caption fg-subtle">{metadata}</div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={rootClass}>
      <div className={headerRowClass}>
        <div className="flex min-w-0 items-center gap-4">
          {leading ? <div className="flex shrink-0 items-center">{leading}</div> : null}
          <div className="flex min-w-0 flex-col gap-1">
            {breadcrumb}
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate type-section fg-default">{title}</h2>
              {titleTrailing ? (
                <span className="flex shrink-0 items-center">{titleTrailing}</span>
              ) : null}
            </div>
            {description ? <p className="type-body-2 fg-subtle">{description}</p> : null}
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0 sm:justify-end">{actions}</div>
        ) : null}
      </div>
      {metadata ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 type-caption fg-subtle">{metadata}</div>
      ) : null}
    </div>
  )
}
