/**
 * Servicios valorizados — the priced breakdown of a client's contract.
 *
 * The studio's ask, verbatim: "este importe se forma por los distintos servicios.
 * Necesitariamos que 'Servicios Contratados' aparezca con un campo donde se pueda valorizar
 * el servicio que tienen contratado y que se genere asi un total a pagar que seria el fee
 * mensual." And later: "No encuentro la forma de marcar si el servicio es por proyecto
 * (única vez), mensual ó por Hora".
 *
 * Three rules this surface exists to make visible:
 *
 * 1. Pricing is OPT-IN. A client with no lines keeps its hand-typed fee and bills exactly
 *    as it did before this existed — which is most of the book.
 * 2. Once a client has a MONTHLY line, its fee is the sum of its monthly lines and the
 *    server maintains it. A one-time project price and a per-production price are part of
 *    the contract but never of the fee: a client with only those keeps its hand-typed abono.
 * 3. A one-time price is billed in parts from here ("Cobrar"), until it is used up. A
 *    per-production price is billed through the productions linked to it, by Generar
 *    cobros del mes.
 *
 * Reads and writes go through TanStack Query, and
 * every mutation invalidates the CLIENT as well as the lines: the fee it just recomputed
 * is rendered by the roster, the KPIs and the cashflow projection.
 */
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
  /** The client's current fee, shown while the client is on a hand-typed abono. */
  monthlyFee: number
  /**
   * The lane the contract is priced in. Every figure in this card is the CLIENT's
   * money, and the card used to render all of them through the peso formatter — so the
   * same fee read `US$ 5.000` in the roster and `$ 5.000` here, on one client.
   */
  currency: Currency
  /** The client's standing discount, previewed in the one-time charge dialog. */
  discountPercentBp: number | null | undefined
  canEdit: boolean
  /** Called after every write: the page's roster holds the fee the server just recomputed
   *  and is not a query this card can invalidate. */
  onChange?: () => void
}) {
  const queryClient = useQueryClient()
  const query = useClientServiceLines(clientId)
  const [error, setError] = useState<string | null>(null)
  const [charging, setCharging] = useState<ClientServiceDto | null>(null)

  /**
   * Every write refreshes the lines AND the client. The server recomputes
   * `monthlyFeeMinor` in the same transaction as the line, so a cache that refreshed only
   * the lines would leave the old fee on screen next to a breakdown that no longer sums to it.
   */
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.serviceLines(clientId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.all }),
    ])
    onChange?.()
  }

  /** Surface the SERVER's message, not a generic one (WF004). */
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

  /**
   * A one-time charge creates a COBRO, so the receivables change too. The toast fires only
   * after the server confirmed the write (WF001); a refusal is re-thrown so the dialog can
   * show the server's own message and stay open.
   */
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

  // An errored fetch must never render as "this client has no priced services": the two
  // are opposite claims, and the second one invites the operator to re-enter a contract
  // that already exists.
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
  // The fee is DERIVED only from active MONTHLY lines. Without one the server keeps the
  // hand-typed abono — even when the client carries one-time or per-production lines,
  // which are billed through their own paths and never replace the retainer — and so
  // does this card.
  const derived = lines.some((l) => l.active && l.billingMode === 'monthly')
  const busy = create.isPending || update.isPending || remove.isPending
  // Options the client is not already contracting, so the same service cannot be added
  // twice — which the server refuses anyway.
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
              // The form clears only on success; a refusal is shown by onError and the
              // operator's typed values stay put.
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
