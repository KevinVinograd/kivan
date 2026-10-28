import { Button, Skeleton } from '@/app/components/components'

/** Loading state: the account rows' shape while the treasury store resolves. */
export function SettingsAccountsLoading() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  )
}

/**
 * Section-level error state with retry.
 *
 * Ajustes → Cuentas MUST render this instead of the account list when the treasury fetch
 * fails. The store collapses to a client-seeded anchor account on failure, so a failed fetch
 * used to render as a short, calm list — indistinguishable from "you have not configured your
 * accounts yet" — while still offering Agregar / Editar / Eliminar against a store that never
 * loaded. An empty state is a claim about the data ("there is none"); rendering one over an
 * outage makes that claim falsely, and here it invites the user to act on it.
 */
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
