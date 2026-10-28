import * as React from "react"
import {
  Check as CheckIcon,
  CaretDown as ChevronDownIcon,
  CaretUp as ChevronUpIcon,
} from "@phosphor-icons/react"
import { Select as SelectPrimitive } from "radix-ui"

import { cn } from "@/app/lib/utils"
import { motionClass } from "@/app/lib/motion"

/**
 * Select — shadcn/ui (new-york) Radix select, token-adapted. The trigger maps to
 * the form-control token family (`bg-control` / `border-control`, placeholder
 * `fg-control-placeholder`, chevron `fg-control-icon`); the listbox uses the
 * shared `surface-raised` recipe; items use the neutral `bg-alpha-subtle-hover`
 * highlight. Focus uses the shared `ring-focus` halo; aria-invalid swaps to the
 * danger border. Theme is handled by the tokens (no `dark:` overrides).
 */
function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({
  placeholder,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  // A bare-string placeholder is a crash surface, not a style choice. Radix renders
  // the value node as `<Fragment key={showPlaceholder ? "placeholder" : "value"}>`,
  // and that key CHANGES the moment a value is picked — so React unmounts whatever
  // the placeholder rendered. With a raw string that is a text node, and a page
  // translator (Chrome's built-in included) replaces every text node it touches with
  // a `<font>` wrapper: React then calls `removeChild` on a node that is no longer
  // its child, throws NotFoundError, and the app-wide ErrorBoundary blanks the screen
  // with "Algo salió mal". Wrapping it in a `<span>` gives React an ELEMENT to remove
  // — translators wrap text nodes, they do not re-parent elements — so the swap keeps
  // working on a translated page.
  //
  // Done HERE rather than at ~24 call-sites: the wrapper is invisible to layout (the
  // trigger's `*:data-[slot=select-value]` rules target the value node above it, and
  // `data-[placeholder]:fg-control-placeholder` colours the trigger, which inherits),
  // so no caller changes and none can forget.
  //
  // This is HALF the defence. The other half — passing explicit `children` to
  // SelectValue — is per-call-site, because only the caller knows the label for a
  // value. It switches off Radix's `SelectItemText` → `valueNode` portal (dist
  // index.mjs:938, gated on `!valueNodeHasChildren`), which is the OTHER cross-tree
  // removal a translated DOM turns into a throw. Applied so far only on the two
  // pickers this was reported from; translation.
  //
  // The root fix is `index.html` refusing translation outright (`lang="es-AR"`,
  // `translate="no"`, the notranslate meta, pinned by document-language-check.mjs).
  // This is defence in depth for the case that opt-out cannot reach: a translator
  // EXTENSION, which ignores both the attribute and the meta.
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      placeholder={
        typeof placeholder === "string" ? <span>{placeholder}</span> : placeholder
      }
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-2 rounded-control border border-control bg-control px-3 py-2 type-body-2 whitespace-nowrap transition-[color,box-shadow,border-color] outline-none hover:border-control-hover focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger-emphasis data-[placeholder]:fg-control-placeholder data-[size=default]:h-10 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:fg-control-icon",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  // A Select with no options is INVISIBLE, not merely empty. Radix runs the
  // `item-aligned` placement routine only once an item has mounted (it needs a selected
  // item to align the listbox against), so a content with zero children keeps a bare
  // `position: fixed` with no offsets and paints itself off-screen at the bottom
  // viewport edge, while the trigger still reports `aria-expanded="true"`. The operator
  // clicks, nothing appears, and the invisible layer then swallows their next click.
  //
  // `popper` placement does not depend on a mounted item, so it anchors to the trigger
  // no matter what. A DISABLED placeholder alone does not fix this — a disabled item
  // never registers as the selected one, so `item-aligned` would stay unplaced.
  //
  // `toArray`, not `count`: `count` includes `null` and `false` slots, so the very common
  // `{cond && <SelectItem/>}` shape reports children while rendering none, which would put
  // the invisible listbox straight back. `toArray` drops those.
  const isEmpty = React.Children.toArray(children).length === 0
  // Derived every render, deliberately. A previous version froze this in `useState` to stop
  // an async list arriving mid-open from remounting the content — but this wrapper sits
  // ABOVE Radix's conditional `Content`, so it mounts with the consumer's tree, not on
  // open. The freeze therefore captured whatever the list looked like at page load: it
  // pinned a picker to `popper` for a dialog's whole life, and worse, a list that was full
  // at mount and empty at open kept `item-aligned` while rendering the empty message —
  // putting back the off-screen listbox this guard exists to remove.
  //
  // The cost is a remount when a list lands while the box is open: `SelectPosition` is the
  // node carrying `role="listbox"` with DismissableLayer and FocusScope attached, so Radix
  // recreates it — the box jumps and scroll, active item and typeahead all reset. Reachable —
  // `cobros-create-cobro-dialog`'s Cliente and `pagos-create-pago-dialog`'s pickers keep
  // their triggers enabled over an initially-empty async array. It is accepted, not
  // unreachable: a visible jump is strictly better than the invisible off-screen listbox
  // this replaces, and pinning the strategy proved worse than both (see the history).
  const resolvedPosition = isEmpty ? "popper" : position
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        data-empty={isEmpty ? "" : undefined}
        className={cn(
          "relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto surface-raised fg-default data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-[var(--motion-duration-hover)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-[var(--motion-duration-quick)]",
          resolvedPosition === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={resolvedPosition}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-2",
            // The empty branch takes the popper WIDTH but not its height: pinning the
            // viewport to the trigger height leaves ~24px of content box after `p-2`,
            // which clips the message this branch exists to show.
            resolvedPosition === "popper" &&
              !isEmpty &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-2",
            resolvedPosition === "popper" &&
              isEmpty &&
              "w-full min-w-[var(--radix-select-trigger-width)] scroll-my-2",
          )}
        >
          {isEmpty ? (
            // Carries `role="option"` on purpose, not as decoration: the content is a
            // `listbox`, and a listbox with no option child fails axe's
            // `aria-required-children`. `aria-disabled` keeps it from reading as something
            // pickable. Deliberately NOT a `SelectItem` — that would be selectable, and it
            // would hand Radix a "selected item" that re-enables the broken `item-aligned`
            // placement this branch exists to avoid.
            <div
              role="option"
              aria-disabled="true"
              aria-selected={false}
              data-slot="select-empty"
              className="px-2 py-1.5 type-caption fg-subtle"
            >
              Sin opciones
            </div>
          ) : (
            children
          )}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 type-caption fg-subtle", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-control py-1.5 pr-8 pl-2 type-body-2 outline-hidden select-none focus:bg-alpha-subtle-hover focus:fg-default data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        motionClass("standard"),
        className,
      )}
      {...props}
    >
      <span
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn(
        "pointer-events-none -mx-2 my-1 h-px [background-color:var(--border-alpha-subtle)]",
        className,
      )}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      aria-label="Desplazar hacia arriba"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      aria-label="Desplazar hacia abajo"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
