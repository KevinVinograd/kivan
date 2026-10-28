/** Invoice emitters (monotributos) — the fiscal identities facturas are issued from. */
import { z } from 'zod'

import { apiClient } from './client'

/**
 * One emisor as `GET /invoice-emitters` returns it. Limits are integer minor units
 * serialized as strings and are nullable (an emisor may declare no ceiling);
 * `monthIssuedMinor` is the amount actually issued in the CURRENT month, computed
 * server-side from the issued receivables.
 *
 * Validated at the boundary rather than cast: `id` is the UUID every
 * `POST /receivables/:id/invoice/generate` is addressed to, and the limits decide
 * whether the UI offers to issue at all. A silently reshaped payload here would either
 * post to a nonexistent emisor or read a maxed-out monotributo as available.
 */
export const InvoiceEmitterSchema = z.object({
  id: z.string(),
  code: z.string(),
  label: z.string(),
  // Both MATCH THE API, which is the only contract that matters here. They did not:
  // `cuit` is `string | null` server-side (an emisor may have none recorded) and
  // `puntoDeVenta` is an `Int`. The mismatch threw a ZodError on every emitter fetch the
  // moment a workspace had one row — `apiClient` treats schema drift as a bug, not an
  // HTTP error — so `/clientes`, the factura dialog and the commitment picker all read it
  // as "could not load". A workspace with NO emisores parsed fine (an empty array always
  // does), which is why it went unnoticed.
  cuit: z.string().nullable(),
  puntoDeVenta: z.number(),
  connected: z.boolean(),
  monthlyLimitMinor: z.string().nullable(),
  annualLimitMinor: z.string().nullable(),
  monthIssuedMinor: z.string(),
})

export const InvoiceEmittersSchema = z.array(InvoiceEmitterSchema)

export type InvoiceEmitterDto = z.infer<typeof InvoiceEmitterSchema>

export const emittersApi = {
  list: () =>
    apiClient.get<InvoiceEmitterDto[]>('/invoice-emitters', { schema: InvoiceEmittersSchema }),
}
