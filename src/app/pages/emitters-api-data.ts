import { useQuery } from '@tanstack/react-query'

import { emittersApi, type InvoiceEmitterDto } from '@/api/emitters'
import { queryKeys } from '@/queries/keys'
import { toMajor } from '@/lib/money'
import type { EmitterAlertLevel } from './cobros-invoice'

export type RealEmitter = {
  id: string
  code: string
  label: string
  cuit: string
  puntoDeVenta: string
  connected: boolean
  monthlyUsed: number
  monthlyLimit: number
  alert: EmitterAlertLevel
}

const NEAR_LIMIT_RATIO = 0.8


export function emitterAlert(dto: InvoiceEmitterDto): EmitterAlertLevel {
  if (!dto.connected) return 'error_conexion'
  const limit = toMajor(dto.monthlyLimitMinor)
  if (limit <= 0) return 'disponible'
  const used = toMajor(dto.monthIssuedMinor)
  if (used >= limit) return 'limite_alcanzado'
  return used / limit >= NEAR_LIMIT_RATIO ? 'cerca_limite' : 'disponible'
}

export function dtoToEmitter(dto: InvoiceEmitterDto): RealEmitter {
  return {
    id: dto.id,
    code: dto.code,
    label: dto.label,
    cuit: dto.cuit ?? '',
    puntoDeVenta: String(dto.puntoDeVenta),
    connected: dto.connected,
    monthlyUsed: toMajor(dto.monthIssuedMinor),
    monthlyLimit: toMajor(dto.monthlyLimitMinor),
    alert: emitterAlert(dto),
  }
}

export function blocks(alert: EmitterAlertLevel): boolean {
  return alert === 'limite_alcanzado' || alert === 'error_conexion'
}

export function emitterFor(emitters: RealEmitter[], taxProfileId: string | undefined): RealEmitter | undefined {
  const own = emitters.find((e) => e.code === taxProfileId)
  if (own && !blocks(own.alert)) return own
  return emitters.find((e) => !blocks(e.alert))
}

export function useInvoiceEmitters() {
  const query = useQuery({
    queryKey: queryKeys.emitters.lists(),
    queryFn: () => emittersApi.list(),
  })
  return {
    emitters: (query.data ?? []).map(dtoToEmitter),
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}
