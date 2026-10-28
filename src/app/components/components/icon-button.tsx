import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/app/lib/utils'
import { motionClass, type MotionPreset } from '@/app/lib/motion'
import { buttonVariants } from './button'

/** Square icon-button sizes. Equal width/height so the single icon centers. */
const iconButtonSize = {
  default: 'size-10',
  compact: 'size-9',
  dense: 'size-8',
} as const

export type IconButtonSize = keyof typeof iconButtonSize

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color' | 'children'>,
    VariantProps<typeof buttonVariants> {
  /** Required — an icon-only button has no visible text, so it MUST name itself. */
  'aria-label': string
  /** Square size scale. */
  size?: IconButtonSize
  /**
   * Motion preset. Defaults to `press`. Keep `press` for icon actions inside
   * table rows and dense toolbars; reserve `soft-magnetic` for visible primary
   * actions only. `none` opts out. See `lib/motion.ts`.
   */
  motion?: MotionPreset
  /**
   * Persistent selected/toggle state. Mirrors `Button`: applies the variant's
   * active-state background (the same `--button-*-bg-active` token used while
   * pressed) at rest and reflects the value via `aria-pressed`. Reuses existing
   * tokens; introduces none. Used for active filter/sort triggers in toolbars.
   */
  selected?: boolean
  /** The single icon. Pass it `aria-hidden`; the accessible name is `aria-label`. */
  children: ReactNode
}

/**
 * IconButton — the primitive icon-only button. It does NOT re-implement button
 * styling: it shares `Button`'s exact visual contract (`buttonVariants`, the
 * same variant × color × `--button-*` token recipe) and only swaps the text
 * padding for a square footprint. `aria-label` is required because there is no
 * visible label. For a button with text use `Button`.
 *
 * Forwards its ref to the underlying `<button>`, so it composes as the child of
 * a Radix `asChild` trigger (Popover / Tooltip / DropdownMenu) and the overlay
 * anchors to it correctly.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant, color, size = 'default', motion = 'press', selected, type = 'button', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      data-selected={selected ? 'true' : undefined}
      className={cn(
        buttonVariants({ variant, color }),
        iconButtonSize[size],
        motionClass(motion),
        'shrink-0',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
})
