import { Badge } from '@/app/components/components'
import type { Client } from './clients-mock-data'
import { useClientServiceLines } from './client-month-data'

export function ClientServiceBadges({ client }: { client: Client }) {
  const lines = useClientServiceLines(client.id)
  const priced = (lines.data ?? []).filter((line) => line.active).map((line) => line.name)
  const names = priced.length > 0 ? priced : client.services
  if (names.length === 0) return <span className="type-body-2 fg-subtle">Sin servicios cargados</span>
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {names.map((name) => (
        <Badge key={name} variant="outline" shape="pill">
          {name}
        </Badge>
      ))}
    </span>
  )
}
