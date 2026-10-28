/**
 * "Servicio" in the production form: which of the client's production prices this
 * production is billed under ("según que tipo de producción sea el valor puede variar").
 *
 * Two kinds of price qualify. A PER-PRODUCTION line prefills "Monto a facturar" with its
 * price, which stays editable. A PER-HOUR line ("producción con celular" / "con cámara",
 * 2026-10-19) bills hours × its price, which the API computes and the form shows. Only
 * rendered when the chosen client has such prices. A linked, approved production is what
 * Generar cobros del mes bills on the client's next cobro.
 */
import { useQuery } from '@tanstack/react-query'

import { clientsApi, type ClientServiceDto } from '@/api/clients'
import { queryKeys } from '@/queries/keys'
import { isProductionBillingMode } from './clients-service-lines-format'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/components'

/** Sentinel for "not billed under a service": a Radix SelectItem cannot carry ''. */
const NONE = 'none'

export function ProductionServiceField({
  clientId,
  value,
  onChange,
}: {
  clientId: string
  value: string | null
  /** The picked per-production line, or null to unlink. */
  onChange: (line: ClientServiceDto | null) => void
}) {
  const query = useQuery({
    queryKey: queryKeys.clients.serviceLines(clientId),
    queryFn: () => clientsApi.listServiceLines(clientId),
    enabled: clientId !== '',
  })
  const options = (query.data ?? []).filter(
    (l) => isProductionBillingMode(l.billingMode) && (l.active || l.id === value),
  )
  if (clientId === '' || (options.length === 0 && !value)) return null
  const current = options.find((l) => l.id === value)

  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">Servicio del cliente</span>
      <Select
        value={value ?? NONE}
        onValueChange={(next) => onChange(options.find((l) => l.id === next) ?? null)}
      >
        <SelectTrigger className="w-full" aria-label="Servicio del cliente">
          {/* Explicit children: Radix otherwise moves the item's text node into the value
              node, which throws on a machine-translated page. */}
          <SelectValue>
            <span>{current ? current.name : 'Sin servicio'}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Sin servicio</SelectItem>
          {options.map((line) => (
            <SelectItem key={line.id} value={line.id}>
              {line.billingMode === 'per_hour' ? `${line.name} (por hora)` : line.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="type-caption fg-subtle">
        Se suma al próximo cobro del cliente al generar los cobros del mes.
      </span>
    </label>
  )
}
