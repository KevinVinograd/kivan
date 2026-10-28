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

// Selected/active nav surface: a subtle floating card lifted off the (now flat)
// desktop rail — subtle surface fill + subtle alpha border + subtle shadow, keeping
// the nav-row control radius (NOT the `surface-subtle` composite, whose container
// radius is too round for a row). `relative overflow-hidden` anchors and clips the
// SelectedAccent chevron to the card's edge; `fg-high-contrast` carries the active
// foreground step (label + icon).
const ACTIVE_ROW =
  'relative overflow-hidden bg-surface-flat border border-alpha-subtle shadow-subtle fg-high-contrast'
const INACTIVE_ROW = 'fg-default hover:bg-alpha-subtle-hover'

/**
 * The selected-item accent: the SAME chevron as the BrandLogo accent glyph
 * (`data-glyph="accent"`, `fill-brand-mark-accent` — deep teal on light, Kivan lime
 * on dark), reused as the active-row marker. It is absolutely pinned to the row's
 * left edge and CLIPPED by the row's `overflow-hidden`, so only part of the chevron
 * shows — it reads as a brand tab cut by the card's edge. The `viewBox` frames just
 * the accent out of the 24x24 mark; the path is duplicated from BrandLogo (the single
 * source of truth for the glyph) to avoid coupling the two files — keep them in sync.
 * Decorative (`aria-hidden`): the active state is already named by `aria-current`.
 */
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
  /** Semantic icon component from the registry (`ICON.*`). Rendered by SideNav so
   *  it can switch to `weight="fill"` for the active item. */
  icon?: Icon
  badge?: string | number
}

/** A collapsible parent entry that groups related routes under one disclosure
 *  header. It has NO route of its own: clicking the header only toggles the
 *  group open/closed. Children are plain `NavItem`s (one level deep — groups do
 *  not nest). The `icon` names the cluster on the collapsed icon rail, where the
 *  group renders as a right-side flyout instead of an inline disclosure. */
export type NavGroup = {
  label: string
  icon?: Icon
  children: NavItem[]
}

/** A primary-nav entry is either a single link or a collapsible group. */
export type NavEntry = NavItem | NavGroup

function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry
}

/** A create-entity action behind the "Nuevo" launcher dropdown. Supplied by the
 *  consumer, keeping SideNav domain-agnostic (the same contract as `items`). */
export type NewAction = {
  label: string
  /** Semantic icon component from the registry (`ICON.*`), rendered as the
   *  leading glyph on the menu item. */
  icon: Icon
  onSelect: () => void
}

/** The signed-in person as the rail needs them: a name to show, a short form to fall
 *  back to inside the avatar, and the one action that ends the session. Supplied by
 *  the consumer — SideNav never reads the auth store. */
export type NavUser = {
  /** Display name, e.g. "Ana Pérez". Shown beside the avatar on the labeled rail. */
  name: string
  /** Fallback rendered inside the avatar (1-2 characters). */
  initials: string
  /** Secondary line under the name. The email in practice; omit to show only the name. */
  detail?: string
  /** Where "Mi perfil" navigates. */
  profileHref: string
  /** Ends the session. The rail neither clears tokens nor navigates — it just asks. */
  onSignOut: () => void
}

export type SideNavProps = {
  /** Primary nav model: single links and/or collapsible groups (one level deep). */
  items: NavEntry[]
  /** Bottom-pinned items (e.g. Configuración). Single links only — no groups. */
  footerItems?: NavItem[]
  /** Active location used to mark items active (`href === activePath`). Applies to
   *  top-level items, group children, and footer items. */
  activePath?: string
  /** Mobile drawer open (slid in). Ignored on desktop, where the rail is always visible. */
  open?: boolean
  /** Invoked by the in-nav close button (mobile only). */
  onClose?: () => void
  /** Desktop rail collapsed to the icon rail. Ignored on mobile (the drawer is always labeled). */
  collapsed?: boolean
  /** Toggles the desktop rail between labeled and icon-only. */
  onToggleCollapse?: () => void
  /** Show the small caption label under each icon while collapsed. Off by default —
   *  the collapsed rail is icon-only; icon links keep their accessible name via
   *  `aria-label`. Opt in to restore the label-below treatment. */
  collapsedLabels?: boolean
  /** Primary create action behind the "Nuevo" launcher, used only when
   *  `newActions` is empty/omitted. Unwired = inert placeholder. */
  onNew?: () => void
  /** Create-entity actions behind the "Nuevo" launcher. When provided (non-empty),
   *  the launcher becomes a dropdown menu; otherwise it falls back to the single
   *  `onNew` click. */
  newActions?: NewAction[]
  /** The signed-in person, rendered as an avatar menu pinned below the footer items.
   *  Omitted (the default) renders nothing — the rail stays usable on the pre-auth
   *  surfaces and in stories that have no session. SideNav stays user-BLIND: it never
   *  calls `useAuth`, it is handed the identity and the handler. */
  user?: NavUser
}

function groupHasActiveChild(group: NavGroup, activePath: string | undefined): boolean {
  return group.children.some((child) => child.href === activePath)
}

/**
 * Primary navigation rail. Presentational and domain-agnostic: every item, the
 * active state, and any badge value is supplied by the consumer. Two independent
 * axes, both owned by AppShell: `open` drives the mobile drawer (off-canvas when
 * closed); `collapsed` drives the desktop icon rail (256px labeled <-> 86px
 * icon-only). Collapsed items are icon-only by default; pass `collapsedLabels`
 * to restore the small caption under each icon.
 *
 * Chrome: the BrandLogo is a static brand mark (not a toggle). Expanded, a trailing
 * collapse IconButton owns the rail toggle (a close IconButton takes its place on the
 * mobile drawer). Collapsed, the "K" mark rests on the nav-icon column and swaps for
 * the expand IconButton on rail hover/focus (a CSS-only opacity swap, jump-free in the
 * fixed `h-10` slot). The active item is marked by the SelectedAccent brand chevron,
 * clipped at its left edge.
 *
 * Items may be single links (`NavItem`) or collapsible groups (`NavGroup`, one
 * level deep). A group's header has no route — clicking it only toggles the
 * group. A group auto-expands when one of its children is the active route; the
 * user may then toggle it (the manual choice wins until the active group changes).
 * On the collapsed icon rail a group becomes a right-side flyout so its children
 * stay reachable without expanding the rail. Local disclosure state lives here;
 * SideNav stays a single self-contained nav.
 *
 * Structure: the `<aside>` is a transparent positioning wrapper that insets the
 * panel 8px on all four sides (`p-2`) at every breakpoint, so the nav rows sit an
 * equal 24px from both aside edges (8px wrapper + 16px panel). On mobile that inset
 * floats the drawer free of the viewport edge over the scrim; on desktop the right
 * inset sits between the panel and the rail divider, which stays pinned to the
 * aside's right edge (the nav<->content boundary), and the 40px page gutter still
 * owns the gap to the content region. The inner panel is the visual
 * surface. The mobile drawer stays a readable floating card over the scrim (surface
 * fill + subtle border + subtle shadow + container radius). On the DESKTOP rail the
 * panel is always fully flat — no fill, border, or shadow — so the rail is invisible
 * and the selected item is the only lifted surface (even on the daytime-hero
 * dashboard). The nav never applies a backdrop blur or translucency in any state.
 *
 * Motion: the mobile drawer slide eases on the panel cadence — `--motion-duration-panel`
 * (220ms) on `--motion-ease-in-out` — so the drawer eases in/out instead of snapping.
 * The transition targets ONLY `translate`: Tailwind v4 moves
 * `-translate-x-full`/`translate-x-0` through the CSS `translate` property (NOT
 * `transform`), so the slide must transition `translate` to animate at all. The desktop
 * labeled⇄collapsed switch changes `width` INSTANTLY (width is deliberately NOT
 * transitioned): because the collapsed rail centers its content, animating the width
 * makes the centered icon column sweep across as the rail shrinks — a harsh,
 * one-directional jump on collapse. Snapping the width keeps the centered column fixed,
 * so only the labels drop and the panel resizes in place. Stripped under
 * `prefers-reduced-motion` via `motion-reduce:transition-none`.
 */
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

  // Per-group disclosure override. A group with no entry follows its active
  // state (open when a child is active); once the user toggles it, the explicit
  // choice wins until the active group changes.
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({})

  // The launcher Button. When `newActions` are supplied it is wrapped by a
  // DropdownMenuTrigger (so it must not also fire `onNew`); otherwise it stays a
  // single create button calling `onNew`.
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
        // Width: the mobile drawer keeps a fixed 256px (`w-64`); the in-flow desktop
        // rail is fluid between 192px and 248px (`md:w-[clamp(12rem,20vw,15.5rem)]`) so
        // it no longer eats ~1/3 of a tablet viewport. The collapsed override below
        // (`md:w-16`) still wins via tailwind-merge (last conflicting `md:w-*`).
        // `md:relative` (instead of static) establishes the positioning context for the
        // desktop-only right-edge divider below — same in-flow layout, no z-index.
        'group/nav fixed inset-y-0 left-0 z-50 flex w-64 md:w-[clamp(12rem,20vw,15.5rem)] flex-col p-2 transition-[translate] duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-in-out)] motion-reduce:transition-none md:relative md:z-auto md:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
        // Collapsed desktop rail: a compact 64px icon rail whose 36×36 targets center on
        // the rail axis. The aside's even 8px inset (base `p-2`) keeps the rail off the
        // viewport edge and puts the icon column on the exact rail centre (32px) — the same
        // gutter as the expanded rail and the mobile drawer. Do NOT re-add `md:pl-0` or
        // `md:pr-0`: either one flushes the rail against an edge and pushes the icon column
        // back off-axis.
        collapsed && 'md:w-16',
      )}
    >
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-4 rounded-container',
          // Collapsed: center every child (brand, launcher, nav, footer) on one axis so
          // the icon rail reads as a tidy centered column of 36×36 targets.
          collapsed ? 'items-center px-2 pt-4 pb-4' : 'p-4',
          // Mobile drawer: an OPAQUE, readable floating card over the scrim (fill +
          // border + shadow) so page content never bleeds through it. No translucency,
          // no backdrop blur. The fill is the PAGE ground (`bg-page`), not a lifted
          // surface: the drawer is the nav's own ground, so it reads exactly like the
          // desktop rail (transparent over `bg-page`) and the selected item stays the
          // only lifted surface in it, at both breakpoints.
          'border border-alpha-subtle bg-page shadow-subtle',
          // Desktop rail: fully flat and invisible — no fill, border, or shadow — so the
          // rail disappears and only the selected item is a surface, even on the
          // daytime-hero dashboard. The mobile card above is untouched (`md:` scope).
          'md:border-0 md:bg-alpha-transparent md:shadow-none',
        )}
      >
        {collapsed ? (
          // Fixed 40px slot (h-10) sized to the 36px target column (w-9) and centered on the
          // rail axis. The "K" mark rests centered and, on rail hover (group/nav) or
          // expand-button focus (group-focus-within/brand), swaps for the centered 36×36
          // expand IconButton. Both are always rendered and overlaid; a CSS-only opacity
          // crossfade (both carry `motion-standard`, no JS state) swaps the mark for the
          // button. `pointer-events-none` keeps the hidden button from intercepting until
          // hover; keeping it in the DOM keeps it keyboard-reachable. The h-10 slot makes
          // the swap jump-free.
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
          // Expanded: the BrandLogo wordmark is a static brand mark (no longer a toggle);
          // the trailing collapse IconButton (desktop) owns the rail toggle — revealed only
          // on rail hover (group/nav) or its own keyboard focus, so the expanded chrome
          // stays quiet at rest and fades in/out on `motion-standard` (mirroring the
          // collapsed rail's hover-swap) — and the close
          // IconButton takes its place on the mobile drawer (md:hidden). The logo keeps pl-3
          // so the "K" sits on the nav-icon column, aligned with the icons below.
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

        {/* 24px break between the top cluster (brand + launcher) and the nav items:
            the container gap-4 (16px) + this mt-2 (8px) = 24px. */}
        <nav
          aria-label="Primary"
          className={cn(
            'mt-2 flex flex-1 flex-col gap-1 overflow-y-auto',
            // Collapsed: center the 36×36 rows on the rail axis; px-1 keeps a hair of
            // horizontal room inside the scroll container so a row's focus ring is not
            // clipped by the nav's overflow.
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

      {/* Desktop rail right-edge divider: a vertical `Separator` hairline pinned to the
          nav↔content boundary, carrying the `mask-fade-top` alpha mask so it fades from
          transparent at the top (0% opacity) to fully opaque at the bottom (100%). It
          gives the otherwise-flat desktop rail subtle definition without a hard
          full-height rule. Desktop-only (`hidden md:block`) — the mobile drawer already
          reads as a bordered floating card, so a fade there would be redundant. The
          wrapper is a pure positioning box spanning the aside's FULL height
          (`inset-y-0`, edge to edge) so the line reaches the bottom edge instead of
          stopping 8px short of it; the `mask-fade-top` keeps the top soft while the
          bottom firms up all the way down. Anchored by the aside's `md:relative`.
          Decorative + inert (`aria-hidden`, `pointer-events-none`). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden md:block"
      >
        <Separator orientation="vertical" className="mask-fade-top" />
      </div>
    </aside>
  )
}

/**
 * The signed-in person, pinned under the footer items as an avatar menu.
 *
 * This exists because sign-out had no home in the shell at all. It lived only at the
 * bottom of Configuración → Mi perfil, three clicks and a scroll away, and nothing in
 * the rail represented the user — so an operator asked whether the app even had one.
 * The avatar in a corner is where people look for it.
 *
 * Reuses the launcher's own dropdown shape rather than introducing a pattern: the
 * trigger is a row, the content opens to the `right` on the collapsed icon rail (where
 * a `bottom` menu would overhang the viewport edge) and `top` on the labeled rail,
 * since this sits at the very bottom of the nav and a downward menu would be clipped.
 *
 * Collapsed, the row is the same 36x36 centered target as every other icon row, and the
 * trigger carries the person's name as its accessible name — the visible label is gone,
 * exactly as `renderNavItem` handles it.
 */
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
          {/* Closes the mobile drawer itself instead of relying on AppShell's route
              effect. That effect fires on a PATHNAME change, and this link carries a
              query (`?section=profile`) — so tapping it from the drawer while already on
              /settings changes the section underneath while the drawer and its blocking
              backdrop stay standing. On desktop `onClose` is a no-op (the drawer is
              already closed), so calling it unconditionally is safe. */}
          <Link to={user.profileHref} onClick={onClose}>
            <ICON.myProfile className="size-4 shrink-0" aria-hidden />
            Mi perfil
          </Link>
        </DropdownMenuItem>
        {/* Cerrar sesión is its own zone, not the next row down. The menu is two items
            tall and the pointer travels straight from the trigger to the bottom one, so
            without the rule an operator reaching for their profile can end the session
            instead (Action grouping). */}
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
  // Collapsed + no caption = icon-only: the visible label is gone, so the link
  // names itself with aria-label (and title for hover discoverability).
  const iconOnly = collapsed && !collapsedLabels
  return (
    <Link
      key={item.href}
      to={item.href}
      aria-current={active ? 'page' : undefined}
      aria-label={iconOnly ? item.label : undefined}
      title={iconOnly ? item.label : undefined}
      className={cn(
        // Motion: `standard` (token-driven color transition only) on the ROW — no
        // magnetic, no lift, the layout never shifts and the selected card stays
        // persistent. `group` lets only the icon glyph micro-scale on row hover
        // (motion-nav-icon, fine pointers) — the one sanctioned transform here.
        // `shrink-0`: the active row's `overflow-hidden` drops its automatic minimum height
        // to 0, so on a rail shorter than its content the browser crushed the SELECTED row
        // first instead of scrolling the nav (HOLD's squashed "Clientes", 2026-10-21).
        'group flex shrink-0 rounded-control motion-standard focus-visible:ring-2 focus-visible:ring-focus',
        // Collapsed icon-only rows are 36×36 (size-9) centered targets sitting on the
        // rail's center axis (matching the brand mark, launcher and toggle). The
        // icon-over-caption row (left-aligned, px-3 py-2) is kept for the opt-in
        // collapsedLabels variant, which needs height for the caption.
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
        // raw ok - structural count chip tied to the nav row; no Badge primitive exists yet
        <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary-default px-1.5 type-caption fg-reverse">
          {item.badge}
        </span>
      ) : null}
    </Link>
  )
}

/**
 * A collapsible group. On the expanded rail and the mobile drawer it renders an
 * inline disclosure: a header `<button>` (icon + label + disclosure caret) that
 * toggles a list of indented, text-only child links beneath it. On the collapsed
 * icon rail (no inline room) it becomes a right-side flyout: the group icon is a
 * DropdownMenuTrigger and the children open as menu items. The header carries no
 * route — it only toggles; the active state lives on the child links.
 */
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
              // Same 36×36 centered target as a collapsed link (icon-only); the
              // icon-over-caption row (px-3 py-2) is kept for the opt-in collapsedLabels
              // variant. `shrink-0` for the same reason as the rows: with a child active
              // this trigger carries the card's `overflow-hidden`, and a short rail crushed
              // it to its 2px border instead of scrolling the nav.
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
        {/* The disclosure caret is quiet at rest and reveals on rail hover (group/nav) or
            when its own group header takes keyboard focus (group-focus-within). Scoped to
            md+ so the mobile drawer always shows the caret (touch has no hover). Opacity
            only — the size-4 slot is reserved, so revealing never shifts the row. */}
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

/**
 * An indented, text-only child link inside an expanded group. No leading icon —
 * the group header's icon names the cluster; the child's left padding aligns its
 * label under the header label (past the icon + gap). Same active card, hover,
 * and badge treatment as a top-level row.
 */
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
        // raw ok - structural count chip tied to the nav row; no Badge primitive exists yet
        <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary-default px-1.5 type-caption fg-reverse">
          {item.badge}
        </span>
      ) : null}
    </Link>
  )
}
