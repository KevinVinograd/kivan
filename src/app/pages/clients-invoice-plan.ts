import type { Receivable } from './cobros-mock-data'
import type { Client } from './clients-mock-data'
import { invoiceable, receivablesForClient } from './clients-receivables'
import { blocks, emitterFor, type RealEmitter } from './emitters-api-data'

export type PlannedInvoice = {
  client: Client
  receivable: Receivable
  emitter: RealEmitter
}

export type BlockedInvoice = {
  client: Client
  receivable: Receivable
  reason: string
}

export type BulkInvoicePlan = {
  issuable: PlannedInvoice[]
  blocked: BlockedInvoice[]
}

export function bulkInvoicePlan(
  clients: Client[],
  receivables: Receivable[],
  emitters: RealEmitter[],
  period?: string,
): BulkInvoicePlan {
  const issuable: PlannedInvoice[] = []
  const blocked: BlockedInvoice[] = []

  for (const client of clients) {
    const rows = receivablesForClient(receivables, client.id, period)
    for (const receivable of invoiceable(rows)) {
      const emitter = emitterFor(emitters, receivable.taxProfileId)
      if (!emitter) {
        blocked.push({
          client,
          receivable,
          reason: emitters.length === 0
            ? 'No hay monotributos configurados'
            : 'Todos los monotributos están al límite o sin conexión',
        })
        continue
      }
      if (blocks(emitter.alert)) {
        blocked.push({ client, receivable, reason: 'El monotributo no puede emitir' })
        continue
      }
      issuable.push({ client, receivable, emitter })
    }
  }

  return { issuable, blocked }
}

export function byEmitter(plan: BulkInvoicePlan): { emitter: RealEmitter; count: number }[] {
  const counts = new Map<string, { emitter: RealEmitter; count: number }>()
  for (const item of plan.issuable) {
    const entry = counts.get(item.emitter.id)
    if (entry) entry.count += 1
    else counts.set(item.emitter.id, { emitter: item.emitter, count: 1 })
  }
  return [...counts.values()]
}
