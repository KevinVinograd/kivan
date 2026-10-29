import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'

import { Button, type ButtonColor, type ButtonSize, type ButtonVariant } from '@/app/components/components'

export function DashboardCta({
  href,
  children,
  variant = 'outlined',
  color = 'primary',
  size = 'dense',
  className,
}: {
  href: string
  children: ReactNode
  variant?: ButtonVariant
  color?: ButtonColor
  size?: ButtonSize
  className?: string
}) {
  const navigate = useNavigate()
  return (
    <Button variant={variant} color={color} size={size} className={className} onClick={() => navigate(href)}>
      {children}
    </Button>
  )
}

export function FloatingCardCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <span className="absolute bottom-4 right-4 opacity-0 motion-standard group-hover:opacity-100 focus-within:opacity-100">
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-3 z-0 rounded-container bg-surface-flat group-hover:bg-page"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-3 z-0 rounded-container group-hover:bg-alpha-subtle-hover"
      />
      <span className="relative z-10">
        <DashboardCta href={href}>{children}</DashboardCta>
      </span>
    </span>
  )
}
