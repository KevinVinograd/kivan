import { z } from 'zod'

import { apiClient } from './client'

export const InvoiceEmitterSchema = z.object({
  id: z.string(),
  code: z.string(),
  label: z.string(),
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
