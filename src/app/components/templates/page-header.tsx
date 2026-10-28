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

/**
 * One entry inside a menu action's dropdown. Carries its own glyph because every
 * menu item does.
 */
export type PageHeaderMenuItem = {
  /** Stable id — React key. */
  key: string
  label: string
  icon: Icon
  onSelect: () => void
  disabled?: boolean
}

/**
 * A single page-wide action. Page-level actions are passed as structured
 * descriptors (not raw buttons) so PageHeader can apply the mobile actions rule
 * on its own: on mobile a single primary action stays visible and every other
 * action collapses into a "more" (overflow) menu.
 */
export type PageHeaderAction = {
  /** Stable id — React key and overflow-menu item key. */
  key: string
  /** Visible label: the desktop button text, the overflow item text, and the
   *  accessible name of the icon-only mobile button. */
  label: string
  /** Registry glyph (`ICON.*` / `AFFORDANCE.*`). Required: every overflow menu
   *  item carries a leading icon, and the
   *  add/export mobile primaries collapse to this glyph. */
  icon: Icon
  /** Click handler. For navigation actions, wrap the router navigate here so the
   *  template stays router-agnostic. */
  onClick?: () => void
  /** Button variant. Defaults to `outlined` (secondary); pass `solid` for the
   *  page's primary CTA. */
  variant?: ButtonVariant
  color?: ButtonColor
  disabled?: boolean
  /** Tooltip text shown over the (optionally disabled) control. Requires a
   *  `TooltipProvider` ancestor. */
  tooltip?: string
  /** Marks the single action that stays visible on mobile; the rest move to the
   *  overflow menu. Exactly one action should set this — if none do, the last
   *  action in the list is used. */
  primary?: boolean
  /** Render the `icon` as a leading glyph on the DESKTOP button (add/create
   *  CTAs). Default false — desktop buttons are label-only. */
  leadingIcon?: boolean
  /** Render this action icon-only on desktop/tablet (the `icon` glyph + a tooltip
   *  and `aria-label` of `label`) instead of a labelled button, to keep the header
   *  trailing cluster compact. For secondary utility actions (Exportar, Ver
   *  reportes, etc.); keep create/commit CTAs labelled. Mobile is unaffected
   *  (non-primary actions still collapse into the overflow menu). */
  iconOnly?: boolean
  /** When this action is the mobile primary, render it icon-only (the `icon`
   *  glyph) instead of a labelled button — for add (＋) and export (download)
   *  CTAs. Default false (labelled button kept). */
  mobileIconOnly?: boolean
  /** Shorter label for the mobile primary button (used only there) when the full
   *  `label` would overflow a phone. Desktop and the overflow menu keep `label`. */
  mobileLabel?: string
  /** Accessible-name override applied as `aria-label` on the desktop button, the
   *  icon-only mobile primary, and the overflow item — e.g. to keep a disabled
   *  control's "unavailable" context that the visible `label` omits. */
  ariaLabel?: string
  /**
   * Turns this action into a LAUNCHER: the button opens a dropdown of these items
   * instead of firing `onClick` (which is ignored when `items` is non-empty). For a
   * page whose several create affordances would otherwise each claim a slot in the
   * trailing cluster — one `Agregar` that names what it adds, rather than four verbs
   * competing for the same corner.
   *
   * In the MOBILE overflow menu the items are flattened under a `DropdownMenuLabel`
   * carrying the action's label, rather than nested as a submenu: a submenu inside a
   * menu is a poor touch target, and the primitive exposes no `DropdownMenuSub`.
   *
   * `tooltip` is ignored only where the action renders WITH ITS LABEL — there the visible
   * text already names it. Where the control collapses to a bare glyph (`iconOnly`, or the
   * tablet band's `forceIconOnly`) the tooltip is kept, because an unlabelled icon with no
   * hover text is an affordance the sighted pointer user cannot resolve.
   */
  items?: PageHeaderMenuItem[]
}

/**
 * The subtitle slot below the title. `text` renders a muted sentence; `badge`
 * renders a `Badge` (e.g. the active period on the dashboard). Plain `description`
 * is the text shorthand for the same slot.
 */
export type PageHeaderSubtitle =
  | { variant: 'text'; value: string }
  | { variant: 'badge'; value: string; tone?: BadgeVariant }
  | { variant: 'period'; value: string; status?: string; statusTone?: BadgeVariant }

export type PageHeaderProps = {
  title: string
  description?: string
  /**
   * Variant-driven subtitle slot below the title (`text` | `badge`). Takes the
   * slot over `description` when set; `description` remains the plain-text shorthand.
   */
  subtitle?: PageHeaderSubtitle
  eyebrow?: string
  /**
   * Render the eyebrow at opacity 0: its vertical space is reserved but the text
   * is hidden visually AND from assistive tech (`aria-hidden`), e.g. a
   * placeholder breadcrumb/overline slot. Requires `eyebrow`. On mobile the
   * placeholder is suppressed entirely (`hidden`) so it reserves no vertical
   * space, keeping the mobile header compact; the reserved-space alignment only
   * applies from `md` up (`md:block`).
   */
  eyebrowHidden?: boolean
  /**
   * A Breadcrumb trail rendered in the overline slot (where the eyebrow sits),
   * for a page reached from a parent context the user may want to return to.
   * When set it takes the slot over the `eyebrow`/`eyebrowHidden` placeholder.
   * Default off — pages without a parent trail are unaffected.
   */
  breadcrumb?: ReactNode
  /**
   * Page-wide actions as structured descriptors. On desktop every action renders
   * as a button in order; on mobile a single primary stays visible and the rest
   * collapse into the overflow menu. Page-scope only — no local filters.
   */
  actions?: PageHeaderAction[]
  /**
   * A page-level control cluster (e.g. a period selector). Rendered inline with
   * the actions on desktop and lifted into a row above the title on mobile so it
   * stays compact. Controls are not actions — they do not collapse into the
   * overflow menu. Reserve for page-level navigation/period controls, not data
   * filters (those live in the relevant Panel).
   */
  controls?: ReactNode
  metadata?: ReactNode
}

/** Optional tooltip wrapper. A disabled control still needs a focusable target,
 *  so it is wrapped in a `tabIndex` span (mirrors the disabled-button pattern). */
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

/** The dropdown a menu action opens. Composes safely inside `Tipped`: that wrapper gives
 *  the tooltip ref to a <span> around the control, so only the menu claims the button's
 *  own ref through `asChild`. `DropdownMenu` renders no DOM of its own, so the span still
 *  wraps the trigger and both overlays anchor correctly. */
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

/** A page action rendered as a text button (desktop, and mobile primary when not
 *  icon-only). The leading icon shows only for add/create actions (`leadingIcon`).
 *  `label` overrides the visible text (the mobile primary passes `mobileLabel`);
 *  `dense` is used in the mobile nav pill to match the nav line height. */
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
  // A menu action's click is owned by the DropdownMenuTrigger, so the button must not
  // also carry `onClick` — firing both would run the page handler AND open the menu.
  const menu = action.items?.length ? action.items : null
  const onClick = menu ? undefined : action.onClick
  // `iconOnly` utility actions render icon-only at every width; `forceIconOnly`
  // (true on tablet) collapses ALL actions — primary CTAs included — to icons so
  // the trailing cluster stays compact at iPad-portrait width. Tooltip = label.
  // Mobile is unaffected — secondary actions collapse into the overflow menu.
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
    // The tooltip is COMPOSED with the menu here, not skipped. This branch is the only one
    // with a guaranteed tooltip (`?? action.label`), because the control is a bare glyph —
    // dropping it for menu actions would leave the tablet band with an unlabelled icon,
    // breaking the "icon + tooltip at every width" contract this component states. Safe to
    // nest: `Tipped` puts the tooltip ref on a wrapping <span>, never on the control, so it
    // does not contest the DropdownMenuTrigger's `asChild` ref.
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

/** The single action kept visible on mobile. Add/export CTAs collapse to an
 *  icon-only button; everything else keeps its label. `dense` for the nav pill. */
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

/** The mobile overflow "more" menu carrying every non-primary action. In the nav
 *  pill (`dense`) the trigger is transparent so it sits cleanly inside the pill. */
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
          // A menu action FLATTENS here rather than nesting: the primitive exposes no
          // submenu, and a submenu inside a menu is a poor touch target anyway. Its
          // label becomes the group heading, so the items keep the context the
          // collapsed launcher would otherwise have carried.
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

/**
 * L1 page entry header. Renders the page title plus optional eyebrow,
 * description, a control cluster, page-wide actions, and metadata. Owns its own
 * internal spacing; the surrounding MainContent owns the page gutter.
 *
 * Mobile actions rule: on mobile (`useIsMobile`, below `md`) the header keeps a
 * single primary action visible and collapses the rest into an overflow menu, and
 * lifts the control cluster into a row above the title. The mobile primary +
 * overflow are portaled onto the AppShell nav line (the right-side pill via
 * `usePageActionsSlot`); without a shell slot they fall back to an inline row.
 *
 * Desktop/tablet density: utility actions (`iconOnly`) render as icon-only buttons
 * (tooltip = label) at every width; on tablet (768-1023px) ALL actions — primary
 * CTAs included — collapse to icons so the trailing cluster stays compact, while
 * desktop (≥lg) keeps primaries labelled. The title/cluster row is `flex-nowrap` (the
 * cluster `ml-auto`), so it reads as `justify-between`: the title column (`min-w-0`)
 * shrinks and wraps its text to make room, keeping the `shrink-0` trailing cluster
 * inline on the same row at every width instead of dropping it to a second line.
 *
 * Use for page-level actions only — local filters belong inside the relevant Panel.
 */
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
  // Tablet band (768-1023px): collapse ALL trailing actions to icon buttons (applied
  // in the desktop cluster below via forceIconOnly).
  const isTablet = useIsBelowDesktop() && !isMobile
  // On mobile the primary + overflow render in the AppShell nav-line pill via this
  // slot; null on desktop (and when PageHeader is used outside the shell).
  const actionsSlot = usePageActionsSlot()

  // Publish the page title so chrome above the page (the mobile shell pill) can
  // mirror it. PageHeader is the single L1 header per page, so it is the natural
  // source of truth; the setter is a no-op when rendered outside the provider.
  const setPageTitle = useSetPageTitle()
  useEffect(() => {
    setPageTitle(title)
  }, [title, setPageTitle])

  const actionList = actions ?? []
  const hasActions = actionList.length > 0
  const hasCluster = hasActions || Boolean(controls)

  // Mobile: one primary stays visible, the rest collapse into the overflow menu.
  const primaryAction = actionList.find((action) => action.primary) ?? actionList[actionList.length - 1]
  const overflowActions = actionList.filter((action) => action !== primaryAction)

  // Desktop: the primary CTA is pinned to the FAR RIGHT of the trailing cluster
  // (— primary CTA occupies the right edge). The
  // cluster is justify-end, so the LAST rendered action sits at the right edge —
  // render the primary last regardless of its index in `actions`. When no action is
  // flagged `primary`, primaryAction is already the last item, so order is unchanged.
  const desktopActions = primaryAction
    ? [...actionList.filter((action) => action !== primaryAction), primaryAction]
    : actionList

  // The mobile actions cluster (dense): primary + overflow, portaled onto the
  // AppShell nav line (right pill) or rendered inline if no shell slot exists.
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

  // Subtitle slot: the variant-driven `subtitle` takes precedence; otherwise the
  // plain-text `description` shorthand renders as the text variant.
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
    // `min-w-0` lets the title column shrink below its content width in the desktop
    // row so the `shrink-0` action/controls cluster stays inside the px-8 gutter
    // instead of overflowing and clipping a trailing action (e.g. Reportes
    // "Exportar" at the ~768-1023px tablet band). Benign in the mobile flex-col.
    <div className="min-w-0 flex flex-col gap-1">
      {overlineNode}
      <h1 className="type-display fg-default">{title}</h1>
      {subtitleNode}
    </div>
  )

  return (
    // PageHeader owns a TooltipProvider so its own controls work on any page: the
    // icon-only actions always carry a tooltip (= label), and disabled actions show
    // theirs, without each consumer page having to supply a provider. Nesting under a
    // page-level provider is safe, and createPortal preserves this React context for
    // the mobile actions portaled onto the AppShell nav line.
    <TooltipProvider>
      {/* Top padding ramps with the responsive page gutter so the first row —
          overline or title — sits proportional to the side inset: 16px (pt-4) below
          lg, 20px (lg:pt-5) at laptop, 24px (desktop:pt-6) at desktop; bottom holds
          16px (pb-4). Horizontal is the page gutter the header owns: 16px mobile,
          24px tablet (md), 32px laptop (lg), 40px desktop. */}
      <header className="flex flex-col gap-4 px-4 pb-4 pt-4 md:px-6 lg:px-8 lg:pt-5 desktop:px-10 desktop:pt-6">
        {isMobile ? (
          <>
            {controls ? <div className="flex flex-wrap items-center gap-2">{controls}</div> : null}
            {titleColumn}
            {/* Mobile primary + overflow live on the AppShell nav line (right pill);
                fall back to an inline row when no shell slot is present. */}
            {mobileActions && actionsSlot
              ? createPortal(mobileActions, actionsSlot)
              : mobileActions
                ? <div className="flex items-center gap-2">{mobileActions}</div>
                : null}
          </>
        ) : (
          // flex-nowrap + the cluster's ml-auto behave as justify-between: the title
          // column (min-w-0) shrinks and wraps its text so the shrink-0 trailing cluster
          // stays inline on the same row, never dropping to a second line below the title.
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
