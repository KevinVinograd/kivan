/**
 * Admin / Operations Dashboard — CTA routing + the active-billing predicate.
 *
 * One central place for where dashboard CTAs navigate, mirroring the Owner
 * dashboard's vocabulary: operational / close items go to `/operacion-mensual`
 * (the monthly close hub), per-person banking goes to `/team`, and facturación
 * goes to the dedicated Facturación module (`/billing`). Block-level anchors inside
 * `/operacion-mensual` (`?block=estado|clientes|equipo`) are consumed by the page,
 * so CTAs land on the right block.
 */
import { clientTotalToBill } from './monthly-operation-format'
import type { ClientMonth } from './monthly-operation-mock-data'

export const ROUTE = {
  operacion: '/operacion-mensual',
  operacionEstado: '/operacion-mensual?block=estado',
  operacionClientes: '/operacion-mensual?block=clientes',
  operacionEquipo: '/operacion-mensual?block=equipo',
  team: '/team',
  // Facturación / ARCA: the dedicated Facturación module.
  facturacion: '/billing',
} as const

/** A client that should be invoiced this month: active (not churned) with an amount to bill. */
export function isActiveBilling(client: ClientMonth): boolean {
  return client.monthStatus !== 'churned' && clientTotalToBill(client) > 0
}
