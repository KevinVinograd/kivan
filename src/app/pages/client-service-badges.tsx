/**
 * The client's services on its Resumen: the priced lines of its contract when it has any,
 * else the labels ticked when it was created.
 *
 * The Resumen used to read only those labels, which nothing derives from the lines — so a
 * client whose services were loaded in Facturación → Servicios valorizados showed none
 * (HOLD's review of 2026-10-21).
 */
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
