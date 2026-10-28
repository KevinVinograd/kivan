import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/app/lib/utils'
import { motionClass, type MotionPreset } from '@/app/lib/motion'

/**
 * Shared visual contract — variant (solid / outlined / transparent) × color
 * (primary / danger). Consumed by BOTH `Button` and `IconButton` so the two
 * primitives share a single source of visual truth. Every color/border value
 * resolves to a `--button-*` token from `src/styles/semantics-button.css`
 * (theme-aware: the tokens reference the themed fg/bg/border families and flip
 * light ↔ dark on their own).
 *
 * Sizing and width are layered on per-primitive (Button = text padding +
 * optional fullWidth; IconButton = square) and are intentionally NOT baked in
 * here, so the same visual recipe serves both shapes.
 *
 * The `selected` state (toggle/segmented affordance) reuses each combo's
 * `*-bg-active` token via a `data-[selected=true]` variant that mirrors the
 * `active:` background — no new tokens. solid-danger reuses its hover fill
 * (there is no danger active token).
 *
 * Disabled is intentionally color-neutral: a disabled button reads the same
 * whether its resting color is primary or danger. solid-danger already resolves
 * to the shared `--button-solid-*-disabled` tokens; outlined-danger and
 * transparent-danger override their color/border/background to the primary
 * disabled values under `disabled:`, so a disabled danger button never shows a
 * faded-red state.
 *
 * Token consumption note: button tokens have no semantic utility class of their
 * own (per the `semantics-button.css` design — "consumed by var() from the
 * Button component"), so colors are applied via Tailwind arbitrary *properties*
 * (`[color:var(--…)]`, `[background-color:var(--…)]`, `[border-color:var(--…)]`).
 * This is the lint-safe form (`ds/no-forbidden-classnames` only allows
 * `utility-[var(--…)]`, which is ambiguous for `text-`) and it sidesteps the
 * custom `bg-*` / `border-*` utilities.
 */
export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-[var(--button-border-radius)] type-button',
    'transition-colors outline-none',
    'focus-visible:ring-2 focus-visible:ring-focus',
    'disabled:pointer-events-none',
  ],
  {
    variants: {
      variant: {
        solid: '',
        outlined: 'border',
        transparent: '',
      },
      color: {
        primary: '',
        danger: '',
        inverse: '',
      },
    },
    compoundVariants: [
      // ── Solid ──
      {
        variant: 'solid',
        color: 'primary',
        class:
          '[color:var(--button-solid-color)] [background-color:var(--button-solid-bg)] hover:[background-color:var(--button-solid-bg-hover)] active:[background-color:var(--button-solid-bg-active)] data-[selected=true]:[background-color:var(--button-solid-bg-active)] disabled:[background-color:var(--button-solid-bg-disabled)] disabled:[color:var(--button-solid-color-disabled)]',
      },
      {
        variant: 'solid',
        color: 'danger',
        class:
          '[color:var(--button-solid-danger-color)] [background-color:var(--button-solid-danger-bg)] hover:[background-color:var(--button-solid-danger-bg-hover)] data-[selected=true]:[background-color:var(--button-solid-danger-bg-hover)] disabled:[background-color:var(--button-solid-bg-disabled)] disabled:[color:var(--button-solid-color-disabled)]',
      },
      // ── Outlined ──
      {
        variant: 'outlined',
        color: 'primary',
        class:
          '[color:var(--button-outline-color)] [border-color:var(--button-outline-border)] [background-color:var(--button-outline-bg)] hover:[background-color:var(--button-outline-bg-hover)] active:[background-color:var(--button-outline-bg-active)] data-[selected=true]:[background-color:var(--button-outline-bg-active)] disabled:opacity-50',
      },
      {
        variant: 'outlined',
        color: 'danger',
        class:
          '[color:var(--button-outline-danger-color)] [border-color:var(--button-outline-danger-border)] [background-color:var(--button-outline-danger-bg)] hover:[background-color:var(--button-outline-danger-bg-hover)] active:[background-color:var(--button-outline-danger-bg-active)] data-[selected=true]:[background-color:var(--button-outline-danger-bg-active)] disabled:[color:var(--button-outline-color)] disabled:[border-color:var(--button-outline-border)] disabled:[background-color:var(--button-outline-bg)] disabled:opacity-50',
      },
      // ── Transparent ──
      {
        variant: 'transparent',
        color: 'primary',
        class:
          '[color:var(--button-transparent-color)] [background-color:var(--button-transparent-bg)] hover:[background-color:var(--button-transparent-bg-hover)] active:[background-color:var(--button-transparent-bg-active)] data-[selected=true]:[background-color:var(--button-transparent-bg-active)] disabled:[color:var(--button-transparent-color-disabled)] disabled:opacity-50',
      },
      {
        variant: 'transparent',
        color: 'danger',
        class:
          '[color:var(--button-transparent-danger-color)] [background-color:var(--button-transparent-danger-bg)] hover:[background-color:var(--button-transparent-danger-bg-hover)] active:[background-color:var(--button-transparent-danger-bg-active)] data-[selected=true]:[background-color:var(--button-transparent-danger-bg-active)] disabled:[color:var(--button-transparent-color-disabled)] disabled:opacity-50',
      },
      // ── Inverse (reverse-surface matrix; reversed primary) ──
      {
        variant: 'solid',
        color: 'inverse',
        class:
          '[color:var(--button-inverse-color)] [background-color:var(--button-inverse-solid-bg)] hover:[background-color:var(--button-inverse-solid-bg-hover)] active:[background-color:var(--button-inverse-solid-bg-active)] data-[selected=true]:[background-color:var(--button-inverse-solid-bg-active)] disabled:[color:var(--button-inverse-color-disabled)] disabled:opacity-50',
      },
      {
        variant: 'outlined',
        color: 'inverse',
        class:
          '[color:var(--button-inverse-color)] [border-color:var(--button-inverse-outline-border)] [background-color:var(--button-inverse-outline-bg)] hover:[background-color:var(--button-inverse-outline-bg-hover)] active:[background-color:var(--button-inverse-outline-bg-active)] data-[selected=true]:[background-color:var(--button-inverse-outline-bg-active)] disabled:opacity-50',
      },
      {
        variant: 'transparent',
        color: 'inverse',
        class:
          '[color:var(--button-inverse-color)] [background-color:var(--button-inverse-transparent-bg)] hover:[background-color:var(--button-inverse-transparent-bg-hover)] active:[background-color:var(--button-inverse-transparent-bg-active)] data-[selected=true]:[background-color:var(--button-inverse-transparent-bg-active)] disabled:[color:var(--button-inverse-color-disabled)] disabled:opacity-50',
      },
    ],
    defaultVariants: {
      variant: 'solid',
      color: 'primary',
    },
  },
)

/** Text-button padding scale (button dimension tokens). */
const buttonSize = {
  default: 'px-[var(--button-padding-x)] py-[var(--button-padding-y)]',
  dense: 'px-[var(--button-padding-x-dense)] py-[var(--button-padding-y-dense)]',
} as const

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>
export type ButtonColor = NonNullable<VariantProps<typeof buttonVariants>['color']>
export type ButtonSize = keyof typeof buttonSize

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'>,
    VariantProps<typeof buttonVariants> {
  /** Text-padding scale. `dense` uses the compact `--button-padding-*-dense` step. */
  size?: ButtonSize
  /** Stretch to the container width. Use this instead of a `w-*` className override. */
  fullWidth?: boolean
  /**
   * Persistent selected/toggle state. Applies the variant's active-state
   * background (the same `--button-*-bg-active` token used while pressed) at
   * rest and reflects the value via `aria-pressed` — the toggle / segmented
   * affordance. Reuses existing tokens; introduces none.
   */
  selected?: boolean
  /**
   * Motion preset. Defaults to `press` (scale 0.98 + 1px down on click). Use
   * `soft-magnetic` for a primary CTA (subtle 2px hover lift on fine pointers).
   * `disabled` suppresses all transform via CSS regardless of preset. `none`
   * opts out. See `lib/motion.ts`.
   */
  motion?: MotionPreset
}

/**
 * Button — the primitive text button. shadcn/ui (new-york) base adapted to the
 * `--button-*` token contract. Variants: solid / outlined / transparent ×
 * primary / danger. `type` defaults to `"button"` so it never submits a form by
 * accident. For an icon-only button use `IconButton`.
 *
 * Forwards its ref to the underlying `<button>`, so it composes as the child of
 * a Radix `asChild` trigger (DropdownMenu / Popover / Tooltip) and the overlay
 * anchors to it correctly. A dedicated `asChild` prop (Slot polymorphism) is
 * still intentionally omitted — consumers wrap Button in the trigger's `asChild`
 * rather than swapping Button's own tag.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    color,
    size = 'default',
    fullWidth = false,
    selected,
    motion = 'press',
    type = 'button',
    ...props
  },
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
        buttonSize[size],
        motionClass(motion),
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  )
})
