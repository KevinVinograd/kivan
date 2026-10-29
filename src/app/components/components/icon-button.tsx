import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/app/lib/utils'
import { motionClass, type MotionPreset } from '@/app/lib/motion'
import { buttonVariants } from './button'

const iconButtonSize = {
  default: 'size-10',
  compact: 'size-9',
  dense: 'size-8',
} as const

export type IconButtonSize = keyof typeof iconButtonSize

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color' | 'children'>,
    VariantProps<typeof buttonVariants> {
  'aria-label': string
  size?: IconButtonSize
  motion?: MotionPreset
  selected?: boolean
  children: ReactNode
}

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
