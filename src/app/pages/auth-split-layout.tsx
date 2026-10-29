import type { ReactNode } from 'react'

import { BrandLogo } from '@/app/components/components'
import { LoginIllustrationDashboard } from './login-illustration-dashboard'

export function AuthSplitLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <main className="flex min-h-dvh flex-col overflow-hidden bg-gradient-brand lg:grid lg:grid-cols-2">
      <aside className="on-brand-panel relative hidden flex-col p-10 lg:flex">
        <div className="mx-auto flex w-full max-w-[38rem] flex-1 flex-col justify-center gap-10">
          <div className="flex flex-col gap-10">
            <BrandLogo variant="full" className="h-8 w-auto self-start fg-reverse brand-mark-accent-lime" />
            <h2 className="type-hero fg-reverse">
              Tu agencia<br />en un solo lugar.
            </h2>
          </div>
          <div className="relative flex w-full items-center justify-center">
            <LoginIllustrationDashboard />
          </div>
        </div>
      </aside>

      <div className="on-brand-panel flex flex-1 items-center justify-center lg:hidden">
        <BrandLogo variant="full" className="h-10 w-auto fg-reverse brand-mark-accent-lime" />
      </div>

      <section className="mx-2 mb-2 flex items-center justify-center rounded-container border border-alpha-subtle bg-surface-flat px-6 py-8 shadow-subtle lg:mt-2 lg:py-6">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h1 className="type-headline fg-default lg:type-display">{title}</h1>
            {subtitle ? <p className="type-body-2 fg-subtle">{subtitle}</p> : null}
          </div>
          {children}
        </div>
      </section>

    </main>
  )
}
