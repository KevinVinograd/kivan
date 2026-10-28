/**
 * The client view's productions: the history of what was shot for the client, where a
 * communication lead approves it and anyone allowed loads a new one.
 *
 * HOLD asked for it on 2026-10-19: a production loaded in Operación mensual showed nowhere
 * on the client, so its cost looked like it was not counted ("el costo del equipo
 * variable no se suma"). Who shot a given month, and what it cost, moved to the Resumen's
 * "Equipo variable" card on 2026-10-21 (`client-variable-team.tsx`), where HOLD asked for
 * it. Money is shown only to viewers holding `teamCost`, like the fixed team above it.
 */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { hasCapability } from '@hold/shared'

import { ApiError } from '@/api/client'
import { monthlyApi } from '@/api/monthly'
import { queryKeys } from '@/queries/keys'
import { Badge, Button, Card, CardContent, toast } from '@/app/components/components'
import { ICON } from '@/app/lib/icon-registry'
import { useRole } from '@/app/lib/use-role'
import type { Client } from './clients-mock-data'
import { useClientProductions } from './client-productions-data'
import type { ProductionRecord } from './monthly-operation-mock-data'
import { formatCurrency, formatDate, productionStatusBadge } from './monthly-operation-format'
import { ViaticsCell, formatDuration, packCaption } from './monthly-production-viatics'
import { useCanApproveProduction, useCanCreateProduction } from './log-production-item'

/**
 * "Aprobar" on one production — the lead's "se hizo". Only approved productions are billed
 * to the client and paid to whoever shot them, so this is the button that releases both.
 */
function ApprovalButton({ production }: { production: ProductionRecord }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const approve = production.status !== 'approved'
  return (
    <Button
      variant={approve ? 'outlined' : 'transparent'}
      color="primary"
      size="dense"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await monthlyApi.setProductionApproval([production.id], approve)
        } catch (error) {
          toast.error(approve ? 'No se pudo aprobar la producción' : 'No se pudo quitar la aprobación', {
            description:
              error instanceof ApiError && error.status === 409
                ? 'El mes de esta producción está cerrado.'
                : error instanceof ApiError && error.status === 403
                  ? 'No tenés permiso para aprobar producciones.'
                  : 'Probá de nuevo en un momento.',
          })
          setBusy(false)
          return
        }
        await queryClient.invalidateQueries({ queryKey: queryKeys.clients.productionsAll() })
        setBusy(false)
        toast.success(approve ? 'Producción aprobada' : 'Aprobación quitada')
      }}
    >
      {approve ? 'Aprobar' : 'Quitar aprobación'}
    </Button>
  )
}

export function ClientProductionsModule({
  client,
  onLogProduction,
}: {
  client: Client
  onLogProduction: () => void
}) {
  const { role, capabilities } = useRole()
  const showCost = hasCapability(capabilities, 'teamCost')
  const canLog = useCanCreateProduction()
  const canApprove = useCanApproveProduction()
  // Owner/admin, or a communication lead holding a production grant (who sees no money:
  // `showCost` is false for them, and the API sends them none).
  const enabled = role !== 'employee' || canLog || canApprove
  const query = useClientProductions(client.id, enabled)
  if (!enabled) return null

  const all = query.data ?? []

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-caption fg-subtle">Producciones</h3>
        {canLog ? (
          <Button variant="transparent" color="primary" size="dense" onClick={onLogProduction}>
            <ICON.production className="size-4" aria-hidden />
            Cargar producción
          </Button>
        ) : null}
      </div>
      <Card>
        <CardContent className="flex flex-col gap-6">
          {query.isError ? (
            <div className="flex flex-col items-start gap-2">
              <span className="type-body-2 fg-subtle">
                No pudimos cargar las producciones. Su costo no es cero: no lo tenemos.
              </span>
              <Button variant="outlined" color="primary" size="dense" onClick={() => void query.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : query.isLoading ? (
            <span className="type-body-2 fg-subtle">Cargando producciones…</span>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                <span className="type-caption fg-subtle">Historial (últimos 6 meses)</span>
                {all.length === 0 ? (
                  <span className="type-body-2 fg-subtle">Todavía no hay producciones cargadas.</span>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {all.map((p) => {
                      const badge = p.receivableId
                        ? { label: 'En cobro', variant: 'success' as const }
                        : productionStatusBadge(p.status)
                      return (
                        <li key={p.id} className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-col">
                            <span className="type-body-2 fg-default">{p.title}</span>
                            <span className="type-caption fg-subtle">
                              {[
                                formatDate(p.date),
                                p.type,
                                p.responsible || null,
                                formatDuration(p.hours),
                                p.packHours ? packCaption(p) : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-start gap-3">
                            <ViaticsCell production={p} />
                            {showCost ? (
                              <span className="type-body-2 fg-default tabular-nums">{formatCurrency(p.totalCost)}</span>
                            ) : null}
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                            {canApprove && !p.receivableId && p.status !== 'invoiced' ? (
                              <ApprovalButton production={p} />
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
