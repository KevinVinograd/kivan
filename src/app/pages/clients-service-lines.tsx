import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Currency, ServiceBillingMode } from '@hold/shared'

import { ApiError } from '@/api/client'
import { clientsApi, type ClientServiceDto } from '@/api/clients'
import { receivablesApi } from '@/api/receivables'
import { queryKeys } from '@/queries/keys'
import { Card, CardContent, Skeleton, toast } from '@/app/components/components'
import { SERVICE_CATALOG } from './clients-mock-data'
import { formatMoney } from './cobranza-format'
import { monthlyTotal } from './clients-service-lines-format'
import { ServiceLineRow } from './clients-service-line-row'
import { ServiceLineForm } from './clients-service-line-form'
import { ServiceLineChargeDialog } from './clients-service-line-charge-dialog'
import { useClientServiceLines } from './client-month-data'

export function ClientServiceLines({
  clientId,
  monthlyFee,
  currency,
  discountPercentBp,
  canEdit,
  onChange,
}: {
  clientId: string
  monthlyFee: number
  currency: Currency
  discountPercentBp: number | null | undefined
  canEdit: boolean
  onChange?: () => void
}) {
  const queryClient = useQueryClient()
  const query = useClientServiceLines(clientId)
  const [error, setError] = useState<string | null>(null)
  const [charging, setCharging] = useState<ClientServiceDto | null>(null)

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.serviceLines(clientId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.all }),
    ])
    onChange?.()
  }

  function messageFor(err: unknown): string {
    if (err instanceof ApiError && err.message) return err.message
    return 'No pudimos guardar el servicio. Probá de nuevo.'
  }

  const create = useMutation({
    mutationFn: (input: {
      name: string
      priceMinor: string
      billingMode: ServiceBillingMode
      includedHours?: number | null
    }) => clientsApi.createServiceLine(clientId, input),
    onSuccess: async () => {
      await refresh()
      setError(null)
    },
    onError: (err: unknown) => setError(messageFor(err)),
  })

  const update = useMutation({
    mutationFn: (input: {
      id: string
      priceMinor?: string
      billingMode?: ServiceBillingMode
      includedHours?: number | null
    }) => {
      const { id, ...patch } = input
      return clientsApi.updateServiceLine(id, patch)
    },
    onSuccess: async () => {
      await refresh()
      setError(null)
    },
    onError: (err: unknown) => setError(messageFor(err)),
  })

  const remove = useMutation({
    mutationFn: (id: string) => clientsApi.removeServiceLine(id),
    onSuccess: async () => {
      await refresh()
      setError(null)
    },
    onError: (err: unknown) => setError(messageFor(err)),
  })

  async function chargeLine(
    line: ClientServiceDto,
    input: { amountMinor: string; period: string; dueDate: string },
  ) {
    await receivablesApi.chargeServiceLine({ clientServiceId: line.id, ...input })
    await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: queryKeys.receivables.all })])
    toast.success(`Cobro de ${line.name} generado`)
  }

  if (query.isPending) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="type-caption fg-subtle">Servicios valorizados</h3>
        <Skeleton className="h-24 w-full" />
      </section>
    )
  }

  if (query.isError) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="type-caption fg-subtle">Servicios valorizados</h3>
        <Card>
          <CardContent>
            <span className="type-body-2 fg-danger">
              No pudimos cargar los servicios de este cliente.
            </span>
          </CardContent>
        </Card>
      </section>
    )
  }

  const lines: ClientServiceDto[] = query.data ?? []
  const derived = lines.some((l) => l.active && l.billingMode === 'monthly')
  const busy = create.isPending || update.isPending || remove.isPending
  const available = SERVICE_CATALOG.filter((s) => !lines.some((l) => l.name === s))

  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Servicios valorizados</h3>
      <Card>
        <CardContent className="flex flex-col gap-3">
          {lines.length > 0 ? (
            lines.map((line) => (
              <ServiceLineRow
                key={line.id}
                line={line}
                currency={currency}
                canEdit={canEdit}
                busy={busy}
                onPrice={(priceMinor) => update.mutate({ id: line.id, priceMinor })}
                onIncludedHours={(includedHours) => update.mutate({ id: line.id, includedHours })}
                onMode={(billingMode) => update.mutate({ id: line.id, billingMode })}
                onCharge={() => setCharging(line)}
                onRemove={() => remove.mutate(line.id)}
              />
            ))
          ) : (
            <span className="type-body-2 fg-subtle">
              Este cliente factura un abono cargado a mano. Valorizá sus servicios y el fee
              mensual pasa a ser la suma de los mensuales.
            </span>
          )}

          <div className="flex items-baseline justify-between gap-3 border-t border-alpha-subtle pt-3">
            <div className="flex flex-col">
              <span className="type-body-2 fg-subtle">{derived ? 'Fee mensual' : 'Abono actual'}</span>
              {!derived && lines.length > 0 ? (
                <span className="type-caption fg-subtle">
                  Sin servicios mensuales: se cobra el abono cargado a mano
                </span>
              ) : null}
            </div>
            <span className="type-mono tabular-nums fg-default">
              {formatMoney(derived ? monthlyTotal(lines) : monthlyFee, currency)}
            </span>
          </div>

          {canEdit ? (
            <ServiceLineForm
              available={available}
              busy={busy}
              onAdd={(input, reset) => create.mutate(input, { onSuccess: reset })}
            />
          ) : null}

          {error ? <p className="type-body-2 fg-danger">{error}</p> : null}
        </CardContent>
      </Card>
      {charging ? (
        <ServiceLineChargeDialog
          line={charging}
          currency={currency}
          discountPercentBp={discountPercentBp}
          onCharge={(input) => chargeLine(charging, input)}
          onClose={() => setCharging(null)}
        />
      ) : null}
    </section>
  )
}
