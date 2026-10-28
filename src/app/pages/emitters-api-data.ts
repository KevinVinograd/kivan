/**
 * The REAL monotributo emisores, from `GET /invoice-emitters`.
 *
 * The front has been carrying a hardcoded `INVOICE_EMITTERS` list in `cobros-invoice.ts`
 * with invented ids (`monotributo_1`), invented monthly usage and an invented annual
 * total — while the endpoint that returns the real ones, with the amount actually issued
 * this month computed server-side, had no caller at all. Those invented ids are also why
 * nothing could call `POST /receivables/:id/invoice/generate`: it takes an emisor UUID,
 * and the front had none to give.
 *
 * The alert level is DERIVED here from the real numbers rather than stored, so it cannot
 * drift from the usage it describes.
 */
import { useQuery } from '@tanstack/react-query'

import { emittersApi, type InvoiceEmitterDto } from '@/api/emitters'
import { queryKeys } from '@/queries/keys'
import { toMajor } from '@/lib/money'
import type { EmitterAlertLevel } from './cobros-invoice'

/** An emisor with a real id, real usage, and a derived alert level. */
export type RealEmitter = {
  /** The server UUID — what `generateInvoice` must be given. */
  id: string
  /** The fiscal-profile code (`monotributo_1`…), which is what a receivable carries. */
  code: string
  label: string
  cuit: string
  puntoDeVenta: string
  connected: boolean
  monthlyUsed: number
  /** 0 when the emisor declares no ceiling — treat as "no limit", never as "full". */
  monthlyLimit: number
  alert: EmitterAlertLevel
}

/** At or past the ceiling blocks; from 80% it warns. Matches the §9.5 bands. */
const NEAR_LIMIT_RATIO = 0.8


export function emitterAlert(dto: InvoiceEmitterDto): EmitterAlertLevel {
  if (!dto.connected) return 'error_conexion'
  const limit = toMajor(dto.monthlyLimitMinor)
  // No declared ceiling is NOT a reached ceiling. Dividing by zero here would have
  // marked every unlimited emisor as blocked and made the action unreachable.
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
    // Kept as display strings on the front shape: the consumers render them, and an
    // emisor with no CUIT recorded says so rather than printing "null".
    cuit: dto.cuit ?? '',
    puntoDeVenta: String(dto.puntoDeVenta),
    connected: dto.connected,
    monthlyUsed: toMajor(dto.monthIssuedMinor),
    monthlyLimit: toMajor(dto.monthlyLimitMinor),
    alert: emitterAlert(dto),
  }
}

/** Límite alcanzado / error de conexión block issuing; the rest only warn. */
export function blocks(alert: EmitterAlertLevel): boolean {
  return alert === 'limite_alcanzado' || alert === 'error_conexion'
}

/**
 * The emisor to issue a receivable through: its own fiscal profile when that one can
 * still issue, else the first that can. `undefined` when NONE can — the caller must
 * surface that rather than pick a blocked one.
 */
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
    // Consumed, not just exposed: an empty list under a failure is indistinguishable
    // from "every monotributo is at its limit", and the UI would state that as fact.
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}
