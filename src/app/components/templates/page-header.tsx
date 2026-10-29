import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/app/lib/utils'
import { useIsMobile, useIsBelowDesktop } from '@/app/lib/use-is-mobile'
import { usePageActionsSlot } from '@/app/lib/page-actions-slot'
import { useSetPageTitle } from '@/app/lib/use-page-title'
import { AFFORDANCE, type Icon } from '@/app/lib/icon-registry'
import {
  Badge,
  Button,
  IconButton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  type BadgeVariant,
  type ButtonColor,
  type ButtonVariant,
} from '@/app/components/components'

export type PageHeaderMenuItem = {
  key: string
  label: string
  icon: Icon
  onSelect: () => void
  disabled?: boolean
}

export type PageHeaderAction = {
  key: string
  label: string
  icon: Icon
  onClick?: () => void
  variant?: ButtonVariant
  color?: ButtonColor
  disabled?: boolean
  tooltip?: string
  primary?: boolean
  leadingIcon?: boolean
  iconOnly?: boolean
  mobileIconOnly?: boolean
  mobileLabel?: string
  ariaLabel?: string
  items?: PageHeaderMenuItem[]
}

export type PageHeaderSubtitle =
  | { variant: 'text'; value: string }
  | { variant: 'badge'; value: string; tone?: BadgeVariant }
  | { variant: 'period'; value: string; status?: string; statusTone?: BadgeVariant }

export type PageHeaderProps = {
  title: string
  description?: string
  subtitle?: PageHeaderSubtitle
  eyebrow?: string
  eyebrowHidden?: boolean
  breadcrumb?: ReactNode
  actions?: PageHeaderAction[]
  controls?: ReactNode
  metadata?: ReactNode
}

function Tipped({
  tooltip,
  disabled,
  children,
}: {
  tooltip?: string
  disabled?: boolean
  children: ReactNode
}) {
  if (!tooltip) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={disabled ? 0 : undefined}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

function ActionMenu({ items, children }: { items: PageHeaderMenuItem[]; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => {
          const Glyph = item.icon
          return (
            <DropdownMenuItem key={item.key} disabled={item.disabled} onSelect={item.onSelect}>
              <Glyph aria-hidden />
              {item.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ActionButton({
  action,
  label,
  dense,
  forceIconOnly,
}: {
  action: PageHeaderAction
  label?: string
  dense?: boolean
  forceIconOnly?: boolean
}) {
  const Glyph = action.icon
  const menu = action.items?.length ? action.items : null
  const onClick = menu ? undefined : action.onClick
  if (action.iconOnly || forceIconOnly) {
    const control = (
      <IconButton
        variant={action.variant ?? 'outlined'}
        color={action.color}
        size={dense ? 'dense' : undefined}
        aria-label={action.ariaLabel ?? action.label}
        disabled={action.disabled}
        onClick={onClick}
      >
        <Glyph className={dense ? 'size-4' : 'size-5'} aria-hidden />
      </IconButton>
    )
    return (
      <Tipped tooltip={action.tooltip ?? action.label} disabled={action.disabled}>
        {menu ? <ActionMenu items={menu}>{control}</ActionMenu> : control}
      </Tipped>
    )
  }
  const control = (
    <Button
      variant={action.variant ?? 'outlined'}
      color={action.color}
      size={dense ? 'dense' : undefined}
      disabled={action.disabled}
      aria-label={action.ariaLabel}
      onClick={onClick}
    >
      {action.leadingIcon ? <Glyph className="size-4 shrink-0" aria-hidden /> : null}
      {label ?? action.label}
    </Button>
  )
  if (menu) return <ActionMenu items={menu}>{control}</ActionMenu>
  return (
    <Tipped tooltip={action.tooltip} disabled={action.disabled}>
      {control}
    </Tipped>
  )
}

function MobilePrimary({ action, dense }: { action: PageHeaderAction; dense?: boolean }) {
  const Glyph = action.icon
  if (!action.mobileIconOnly) return <ActionButton action={action} label={action.mobileLabel} dense={dense} />
  const menu = action.items?.length ? action.items : null
  const control = (
    <IconButton
      variant={action.variant ?? 'solid'}
      color={action.color}
      size={dense ? 'dense' : undefined}
      aria-label={action.ariaLabel ?? action.label}
      disabled={action.disabled}
      onClick={menu ? undefined : action.onClick}
    >
      <Glyph className={dense ? 'size-4' : 'size-5'} aria-hidden />
    </IconButton>
  )
  if (menu) return <ActionMenu items={menu}>{control}</ActionMenu>
  return (
    <Tipped tooltip={action.tooltip} disabled={action.disabled}>
      {control}
    </Tipped>
  )
}

function OverflowMenu({ actions, dense }: { actions: PageHeaderAction[]; dense?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant={dense ? 'transparent' : 'outlined'}
          color="primary"
          size={dense ? 'dense' : undefined}
          aria-label="Más acciones"
        >
          <AFFORDANCE.overflow className={dense ? 'size-4' : 'size-5'} aria-hidden />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => {
          const Glyph = action.icon
          if (action.items?.length) {
            return (
              <DropdownMenuGroup key={action.key}>
                <DropdownMenuLabel>{action.label}</DropdownMenuLabel>
                {action.items.map((item) => {
                  const ItemGlyph = item.icon
                  return (
                    <DropdownMenuItem key={item.key} disabled={item.disabled} onSelect={item.onSelect}>
                      <ItemGlyph aria-hidden />
                      {item.label}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuGroup>
            )
          }
          return (
            <DropdownMenuItem
              key={action.key}
              disabled={action.disabled}
              onSelect={action.onClick}
              aria-label={action.ariaLabel}
            >
              <Glyph aria-hidden />
              {action.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PageHeader({
  title,
  description,
  subtitle,
  eyebrow,
  eyebrowHidden = false,
  breadcrumb,
  actions,
  controls,
  metadata,
}: PageHeaderProps) {
  const isMobile = useIsMobile()
  const isTablet = useIsBelowDesktop() && !isMobile
  const actionsSlot = usePageActionsSlot()

  const setPageTitle = useSetPageTitle()
  useEffect(() => {
    setPageTitle(title)
  }, [title, setPageTitle])

  const actionList = actions ?? []
  const hasActions = actionList.length > 0
  const hasCluster = hasActions || Boolean(controls)

  const primaryAction = actionList.find((action) => action.primary) ?? actionList[actionList.length - 1]
  const overflowActions = actionList.filter((action) => action !== primaryAction)

  const desktopActions = primaryAction
    ? [...actionList.filter((action) => action !== primaryAction), primaryAction]
    : actionList

  const mobileActions = hasActions ? (
    <>
      <MobilePrimary action={primaryAction} dense />
      {overflowActions.length > 0 ? <OverflowMenu actions={overflowActions} dense /> : null}
    </>
  ) : null

  const overlineNode = breadcrumb ? (
    breadcrumb
  ) : eyebrow ? (
    <p
      className={cn('type-caption fg-primary', eyebrowHidden && 'hidden opacity-0 md:block')}
      aria-hidden={eyebrowHidden || undefined}
    >
      {eyebrow}
    </p>
  ) : null

  const subtitleNode = subtitle ? (
    subtitle.variant === 'badge' ? (
      <Badge variant={subtitle.tone ?? 'neutral'}>{subtitle.value}</Badge>
    ) : subtitle.variant === 'period' ? (
      <div className="flex items-center gap-2">
        <span className="type-body-2 fg-subtle">{subtitle.value}</span>
        {subtitle.status ? (
          <Badge variant={subtitle.statusTone ?? 'neutral'}>{subtitle.status}</Badge>
        ) : null}
      </div>
    ) : (
      <p className="type-body-2 fg-subtle">{subtitle.value}</p>
    )
  ) : description ? (
    <p className="type-body-2 fg-subtle">{description}</p>
  ) : null

  const titleColumn = (
    <div className="min-w-0 flex flex-col gap-1">
      {overlineNode}
      <h1 className="type-display fg-default">{title}</h1>
      {subtitleNode}
    </div>
  )

  return (
    <TooltipProvider>
      <header className="flex flex-col gap-4 px-4 pb-4 pt-4 md:px-6 lg:px-8 lg:pt-5 desktop:px-10 desktop:pt-6">
        {isMobile ? (
          <>
            {controls ? <div className="flex flex-wrap items-center gap-2">{controls}</div> : null}
            {titleColumn}
            {mobileActions && actionsSlot
              ? createPortal(mobileActions, actionsSlot)
              : mobileActions
                ? <div className="flex items-center gap-2">{mobileActions}</div>
                : null}
          </>
        ) : (
          <div className="flex flex-row flex-nowrap items-start gap-4">
            {titleColumn}
            {hasCluster ? (
              <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-4 pt-4">
                {controls}
                {desktopActions.map((action) => (
                  <ActionButton key={action.key} action={action} forceIconOnly={isTablet} />
                ))}
              </div>
            ) : null}
          </div>
        )}
        {metadata ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 type-body-2 fg-subtle">{metadata}</div>
        ) : null}
      </header>
    </TooltipProvider>
  )
}
