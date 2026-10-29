import { useState } from 'react'
import { Link } from 'react-router'
import { cn } from '@/app/lib/utils'
import { MOTION_NAV_ICON } from '@/app/lib/motion'
import {
  Avatar,
  AvatarFallback,
  BrandLogo,
  Button,
  IconButton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Separator,
} from '@/app/components/components'
import { AFFORDANCE, ICON, type Icon } from '@/app/lib/icon-registry'

const ACTIVE_ROW =
  'relative overflow-hidden bg-surface-flat border border-alpha-subtle shadow-subtle fg-high-contrast'
const INACTIVE_ROW = 'fg-default hover:bg-alpha-subtle-hover'

function SelectedAccent() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2"
    >
      <svg viewBox="15.14 7.74 7.2 8.52" aria-hidden className="h-3.5 w-auto fill-brand-mark-accent">
        <path d="M22.3406 11.9L16.6695 16.26L15.1406 14.2739L18.1615 11.9514L15.1654 9.7633L16.6447 7.74L22.3406 11.9Z" />
      </svg>
    </span>
  )
}

export type NavItem = {
  label: string
  href: string
  icon?: Icon
  badge?: string | number
}

export type NavGroup = {
  label: string
  icon?: Icon
  children: NavItem[]
}

export type NavEntry = NavItem | NavGroup

function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry
}

export type NewAction = {
  label: string
  icon: Icon
  onSelect: () => void
}

export type NavUser = {
  name: string
  initials: string
  detail?: string
  profileHref: string
  onSignOut: () => void
}

export type SideNavProps = {
  items: NavEntry[]
  footerItems?: NavItem[]
  activePath?: string
  open?: boolean
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  collapsedLabels?: boolean
  onNew?: () => void
  newActions?: NewAction[]
  user?: NavUser
}

function groupHasActiveChild(group: NavGroup, activePath: string | undefined): boolean {
  return group.children.some((child) => child.href === activePath)
}

// Tailwind v4 moves translate-x through the `translate` property, so transition `translate`, not `transform`.
export function SideNav({
  items,
  footerItems,
  activePath,
  open = false,
  onClose,
  collapsed = false,
  onToggleCollapse,
  collapsedLabels = false,
  onNew,
  newActions,
  user,
}: SideNavProps) {
  const hasNewActions = newActions != null && newActions.length > 0

  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({})

  const launcherButton = collapsed ? (
    <IconButton
      variant="outlined"
      color="primary"
      size="compact"
      aria-label="Nuevo"
      onClick={hasNewActions ? undefined : onNew}
    >
      <AFFORDANCE.create className="size-5" aria-hidden />
    </IconButton>
  ) : (
    <Button
      variant="outlined"
      color="primary"
      size="dense"
      fullWidth
      onClick={hasNewActions ? undefined : onNew}
    >
      <AFFORDANCE.create className="size-5 shrink-0" aria-hidden />
      <span className="flex-1 text-left">Nuevo</span>
      <AFFORDANCE.expand className="size-4 shrink-0" aria-hidden />
    </Button>
  )

  return (
    <aside
      className={cn(
        'group/nav fixed inset-y-0 left-0 z-50 flex w-64 md:w-[clamp(12rem,20vw,15.5rem)] flex-col p-2 transition-[translate] duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-in-out)] motion-reduce:transition-none md:relative md:z-auto md:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
        collapsed && 'md:w-16',
      )}
    >
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-4 rounded-container',
          collapsed ? 'items-center px-2 pt-4 pb-4' : 'p-4',
          'border border-alpha-subtle bg-page shadow-subtle',
          'md:border-0 md:bg-alpha-transparent md:shadow-none',
        )}
      >
        {collapsed ? (
          <div className="group/brand relative flex h-10 w-9 items-center justify-center">
            <BrandLogo
              variant="mark"
              aria-hidden
              className="motion-standard h-6 w-auto group-hover/nav:opacity-0 group-focus-within/brand:opacity-0"
            />
            <IconButton
              variant="transparent"
              color="primary"
              size="compact"
              motion="standard"
              aria-label="Expand navigation"
              onClick={onToggleCollapse}
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 opacity-0 group-hover/nav:pointer-events-auto group-hover/nav:opacity-100 group-focus-within/brand:opacity-100"
            >
              <AFFORDANCE.railExpand className="size-5" aria-hidden />
            </IconButton>
          </div>
        ) : (
          <div className="flex h-10 items-center justify-between gap-2">
            <BrandLogo variant="full" className="h-6 w-auto pl-3" />
            <div className="flex items-center gap-1">
              <IconButton
                variant="transparent"
                color="primary"
                size="default"
                motion="standard"
                aria-label="Collapse navigation"
                onClick={onToggleCollapse}
                className="hidden opacity-0 pointer-events-none group-hover/nav:pointer-events-auto group-hover/nav:opacity-100 focus-visible:opacity-100 md:inline-flex"
              >
                <AFFORDANCE.railCollapse className="size-5" aria-hidden />
              </IconButton>
              <IconButton
                variant="transparent"
                color="primary"
                size="dense"
                aria-label="Close navigation"
                onClick={onClose}
                className="md:hidden"
              >
                <AFFORDANCE.closeNav className="size-5" aria-hidden />
              </IconButton>
            </div>
          </div>
        )}

        {hasNewActions ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>{launcherButton}</DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side={collapsed ? 'right' : 'bottom'}
              className="min-w-56"
            >
              {newActions.map((action) => (
                <DropdownMenuItem key={action.label} onSelect={action.onSelect}>
                  <action.icon className="size-4 shrink-0" aria-hidden />
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          launcherButton
        )}

        <nav
          aria-label="Primary"
          className={cn(
            'mt-2 flex flex-1 flex-col gap-1 overflow-y-auto',
            collapsed && 'items-center px-1',
          )}
        >
          {items.map((entry) => {
            if (!isNavGroup(entry)) {
              return renderNavItem(entry, activePath, collapsed, collapsedLabels)
            }
            const isOpen = openOverrides[entry.label] ?? groupHasActiveChild(entry, activePath)
            const onToggle = () =>
              setOpenOverrides((prev) => ({
                ...prev,
                [entry.label]: !(prev[entry.label] ?? groupHasActiveChild(entry, activePath)),
              }))
            return renderNavGroup(entry, activePath, collapsed, collapsedLabels, isOpen, onToggle)
          })}
        </nav>

        {footerItems && footerItems.length > 0 ? (
          <div className="flex flex-col gap-1">
            {footerItems.map((item) => renderNavItem(item, activePath, collapsed, collapsedLabels))}
          </div>
        ) : null}

        {user ? renderUserMenu(user, collapsed, onClose) : null}
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden md:block"
      >
        <Separator orientation="vertical" className="mask-fade-top" />
      </div>
    </aside>
  )
}

function renderUserMenu(user: NavUser, collapsed: boolean, onClose?: () => void) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={collapsed ? user.name : undefined}
          title={collapsed ? user.name : undefined}
          className={cn(
            'group flex rounded-control motion-standard focus-visible:ring-2 focus-visible:ring-focus',
            INACTIVE_ROW,
            collapsed
              ? 'size-9 items-center justify-center'
              : 'items-center gap-3 px-3 py-2 text-left',
          )}
        >
          <Avatar size="sm">
            <AvatarFallback>{user.initials}</AvatarFallback>
          </Avatar>
          {collapsed ? null : (
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="type-body-2 truncate">{user.name}</span>
              {user.detail ? (
                <span className="type-caption fg-subtle truncate">{user.detail}</span>
              ) : null}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={collapsed ? 'right' : 'top'}
        className="min-w-56"
      >
        <DropdownMenuItem asChild>
          <Link to={user.profileHref} onClick={onClose}>
            <ICON.myProfile className="size-4 shrink-0" aria-hidden />
            Mi perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={user.onSignOut}>
          <ICON.signOut className="size-4 shrink-0" aria-hidden />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function renderNavItem(
  item: NavItem,
  activePath: string | undefined,
  collapsed: boolean,
  collapsedLabels: boolean,
) {
  const active = item.href === activePath
  const Icon = item.icon
  const iconOnly = collapsed && !collapsedLabels
  return (
    <Link
      key={item.href}
      to={item.href}
      aria-current={active ? 'page' : undefined}
      aria-label={iconOnly ? item.label : undefined}
      title={iconOnly ? item.label : undefined}
      className={cn(
        'group flex shrink-0 rounded-control motion-standard focus-visible:ring-2 focus-visible:ring-focus',
        collapsed
          ? collapsedLabels
            ? 'flex-col items-start gap-1 px-3 py-2'
            : 'size-9 items-center justify-center'
          : 'items-center gap-3 px-3 py-2',
        active ? ACTIVE_ROW : INACTIVE_ROW,
      )}
    >
      {active ? <SelectedAccent /> : null}
      {Icon ? (
        <span className={cn('flex size-5 shrink-0 items-center justify-center', MOTION_NAV_ICON)}>
          <Icon className="size-5" weight={active ? 'fill' : 'regular'} aria-hidden />
        </span>
      ) : null}
      {collapsed ? (
        collapsedLabels ? (
          <span className={cn('type-caption w-full truncate text-left', active && 'font-semibold')}>
            {item.label}
          </span>
        ) : null
      ) : (
        <span className={cn('type-body-2 flex-1 truncate', active && 'font-semibold')}>{item.label}</span>
      )}
      {!collapsed && item.badge != null ? (
        <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary-default px-1.5 type-caption fg-reverse">
          {item.badge}
        </span>
      ) : null}
    </Link>
  )
}

function renderNavGroup(
  group: NavGroup,
  activePath: string | undefined,
  collapsed: boolean,
  collapsedLabels: boolean,
  isOpen: boolean,
  onToggle: () => void,
) {
  const Icon = group.icon
  const hasActive = groupHasActiveChild(group, activePath)
  const iconOnly = collapsed && !collapsedLabels

  if (collapsed) {
    return (
      <DropdownMenu key={group.label}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={iconOnly ? group.label : undefined}
            title={iconOnly ? group.label : undefined}
            className={cn(
              'group flex shrink-0 rounded-control motion-standard focus-visible:ring-2 focus-visible:ring-focus',
              collapsedLabels ? 'flex-col items-start gap-1 px-3 py-2' : 'size-9 items-center justify-center',
              hasActive ? ACTIVE_ROW : INACTIVE_ROW,
            )}
          >
            {hasActive ? <SelectedAccent /> : null}
            {Icon ? (
              <span className={cn('flex size-5 shrink-0 items-center justify-center', MOTION_NAV_ICON)}>
                <Icon className="size-5" weight={hasActive ? 'fill' : 'regular'} aria-hidden />
              </span>
            ) : null}
            {collapsedLabels ? (
              <span className={cn('type-caption w-full truncate text-left', hasActive && 'font-semibold')}>
                {group.label}
              </span>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" className="min-w-56">
          {group.children.map((child) => {
            const active = child.href === activePath
            return (
              <DropdownMenuItem key={child.href} asChild className={cn(active && 'font-semibold')}>
                <Link to={child.href} aria-current={active ? 'page' : undefined}>
                  <span className="flex-1 truncate">{child.label}</span>
                  {active ? <AFFORDANCE.selected aria-hidden /> : null}
                </Link>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const Caret = isOpen ? AFFORDANCE.collapseValue : AFFORDANCE.expand
  const panelId = `nav-group-${group.label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div key={group.label} className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={cn(
          'group flex items-center gap-3 rounded-control px-3 py-2 motion-standard focus-visible:ring-2 focus-visible:ring-focus hover:bg-alpha-subtle-hover',
          hasActive ? 'fg-high-contrast' : 'fg-default',
        )}
      >
        {Icon ? (
          <span className={cn('flex size-5 shrink-0 items-center justify-center', MOTION_NAV_ICON)}>
            <Icon className="size-5" weight={hasActive ? 'fill' : 'regular'} aria-hidden />
          </span>
        ) : null}
        <span className={cn('type-body-2 flex-1 truncate text-left', hasActive && 'font-semibold')}>
          {group.label}
        </span>
        <Caret
          className="motion-standard size-4 shrink-0 opacity-100 md:opacity-0 md:group-hover/nav:opacity-100 md:group-focus-within:opacity-100"
          aria-hidden
        />
      </button>
      {isOpen ? (
        <div id={panelId} className="flex flex-col gap-1">
          {group.children.map((child) => renderGroupChild(child, activePath))}
        </div>
      ) : null}
    </div>
  )
}

function renderGroupChild(item: NavItem, activePath: string | undefined) {
  const active = item.href === activePath
  return (
    <Link
      key={item.href}
      to={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center rounded-control py-2 pr-3 pl-11 motion-standard focus-visible:ring-2 focus-visible:ring-focus',
        active ? ACTIVE_ROW : INACTIVE_ROW,
      )}
    >
      {active ? <SelectedAccent /> : null}
      <span className={cn('type-body-2 flex-1 truncate', active && 'font-semibold')}>{item.label}</span>
      {item.badge != null ? (
        <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary-default px-1.5 type-caption fg-reverse">
          {item.badge}
        </span>
      ) : null}
    </Link>
  )
}
