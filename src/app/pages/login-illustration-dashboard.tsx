import { cn } from '@/app/lib/utils'

const BARS = ['h-[45%]', 'h-[68%]', 'h-[40%]', 'h-[88%]', 'h-[58%]', 'h-[76%]', 'h-[62%]']

export function LoginIllustrationDashboard() {
  return (
    <div className="relative w-full" aria-hidden="true">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2.5">
          <span className="block h-5 w-64 rounded-full bg-current fg-reverse-subtle" />
          <span className="block h-3.5 w-32 rounded-full bg-current fg-reverse-disabled" />
        </div>
        <span className="block h-8 w-24 rounded-full border border-current fg-reverse-disabled" />
      </div>

      <div className="mt-6 flex gap-4">
        {Array.from({ length: 5 }, (_, i) => {
          const active = i === 0
          return (
            <div key={i} className="relative flex-1">
              {active ? (
                <span className="absolute inset-0 rounded-control bg-accent-emerald-emphasis opacity-30 blur-md" />
              ) : null}
              <div
                className={cn(
                  'relative flex flex-col gap-2.5 rounded-control border border-current p-3',
                  active ? 'fg-reverse-subtle' : 'fg-reverse-disabled',
                )}
              >
                <span className="block h-3 w-11 rounded-full bg-current fg-reverse-disabled" />
                <span className="block h-3.5 w-14 rounded-full bg-current fg-reverse-subtle" />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 flex gap-6">
        <div className="flex flex-1 flex-col gap-4 rounded-control border border-current fg-reverse-disabled p-6">
          <span className="block h-3.5 w-28 rounded-full bg-current fg-reverse-subtle" />
          <div className="flex h-28 items-end gap-3">
            {BARS.map((h, i) => (
              <span
                key={i}
                className={cn(
                  'flex-1 rounded-t-[5px] bg-current',
                  i === 3 ? 'fg-accent-emerald' : 'fg-reverse-disabled',
                  h,
                )}
              />
            ))}
          </div>
          <svg
            viewBox="0 0 120 32"
            className="h-14 w-full fg-accent-emerald"
            fill="none"
            preserveAspectRatio="none"
          >
            <polyline
              points="0,26 20,17 40,21 60,9 80,15 100,4 120,12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        <div className="flex w-1/3 flex-col items-center gap-4 rounded-control border border-current fg-reverse-disabled p-6">
          <svg viewBox="0 0 36 36" className="size-24">
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              className="fg-reverse-disabled"
            />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="62 100"
              transform="rotate(-90 18 18)"
              className="fg-accent-emerald"
            />
          </svg>
          <span className="block h-3.5 w-full rounded-full bg-current fg-reverse-disabled" />
          <span className="block h-3.5 w-3/4 rounded-full bg-current fg-reverse-disabled" />
        </div>
      </div>

      <div className="mt-6 flex gap-6">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex flex-1 items-center gap-3 rounded-control border border-current fg-reverse-disabled p-3.5"
          >
            <span
              className={cn(
                'size-3.5 shrink-0 rounded-full bg-current',
                i === 0 ? 'fg-accent-emerald' : 'fg-reverse-disabled',
              )}
            />
            <span className="block h-3 flex-1 rounded-full bg-current fg-reverse-disabled" />
            <span className="block h-3 w-12 rounded-full bg-current fg-reverse-subtle" />
          </div>
        ))}
      </div>

      <div className="absolute left-1 top-[8.5rem] w-56 max-w-full -translate-x-10 rounded-container border border-alpha-subtle bg-surface-flat p-3.5 shadow-raised">
        <span className="absolute -top-1.5 left-16 size-3 rotate-45 rounded-tl-[2px] border-l border-t border-alpha-subtle bg-surface-flat" />
        <div className="relative flex items-center justify-between">
          <span className="type-caption font-semibold fg-default">Clientes en riesgo</span>
          <span className="type-caption fg-subtle">3 este mes</span>
        </div>
        <p className="relative mt-1.5 type-body-2 font-semibold fg-default">Cliente Norte</p>
        <p className="relative type-caption fg-subtle">Riesgo alto · sin cobros hace 45 días</p>
      </div>

      <div className="absolute -right-3 -bottom-12 w-52 max-w-full translate-x-10 rounded-container border border-alpha-subtle bg-surface-flat p-3 shadow-raised">
        <span className="absolute -top-1.5 right-24 size-3 rotate-45 rounded-tl-[2px] border-l border-t border-alpha-subtle bg-surface-flat" />
        <div className="relative flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-control type-caption font-semibold fg-subtle">
            MG
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="type-body-2 font-semibold fg-default">María González</span>
            <span className="type-caption fg-subtle">Líder de Finanzas</span>
          </div>
        </div>
        <div className="relative mt-2.5 flex items-center justify-between border-t border-alpha-subtle pt-2.5">
          <span className="type-caption fg-subtle">Salario</span>
          <span className="type-body-2 font-semibold fg-default">$1.8M / mes</span>
        </div>
      </div>
    </div>
  )
}
