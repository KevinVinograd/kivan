import { Button, Skeleton } from '@/app/components/components'

export function SettingsAccountsLoading() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  )
}

export function SettingsAccountsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <h2 className="type-heading fg-default">No pudimos cargar las cuentas</h2>
      <p className="max-w-md type-body-2 fg-subtle">
        No mostramos tus cuentas porque no pudimos traerlas. No es que no tengas ninguna.
        Intentá nuevamente.
      </p>
      <Button variant="solid" color="primary" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  )
}
