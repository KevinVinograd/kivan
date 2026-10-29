import { clientTotalToBill } from './monthly-operation-format'
import type { ClientMonth } from './monthly-operation-mock-data'

export const ROUTE = {
  operacion: '/operacion-mensual',
  operacionEstado: '/operacion-mensual?block=estado',
  operacionClientes: '/operacion-mensual?block=clientes',
  operacionEquipo: '/operacion-mensual?block=equipo',
  team: '/team',
  facturacion: '/billing',
} as const

export function isActiveBilling(client: ClientMonth): boolean {
  return client.monthStatus !== 'churned' && clientTotalToBill(client) > 0
}
