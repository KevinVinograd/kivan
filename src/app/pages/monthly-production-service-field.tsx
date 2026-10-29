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

const NONE = 'none'

export function ProductionServiceField({
  clientId,
  value,
  onChange,
}: {
  clientId: string
  value: string | null
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
