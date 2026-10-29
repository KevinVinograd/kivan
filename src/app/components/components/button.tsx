import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/app/lib/utils'
import { motionClass, type MotionPreset } from '@/app/lib/motion'

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
  size?: ButtonSize
  fullWidth?: boolean
  selected?: boolean
  motion?: MotionPreset
}

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
