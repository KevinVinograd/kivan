/**
 * "Equipo variable" on the client's Resumen: who shot the client's productions in a month,
 * their hours and what they cost, right under the fixed team.
 *
 * HOLD's review of 2026-10-21: "Agregar una tarjeta 'Equipo variable' debajo de 'Equipo
 * fijo' en el Resumen del cliente, filtrable por mes (no siempre va el mismo filmmaker)".
 * The fixed team is paid a monthly amount per client; the variable team is whoever shot
 * the month's productions, paid by the hour. Money is shown only to viewers holding
 * `teamCost`, like the fixed team's amounts.
 */
import { useState } from 'react'
import { hasCapability } from '@hold/shared'

import {
  Button,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/components'
import { todayIso } from '@/app/lib/iso-date'
import { periodLabel } from '@/app/lib/periods'
import { useRole } from '@/app/lib/use-role'
import type { Client } from './clients-mock-data'
import { useClientProductions } from './client-productions-data'
import type { ProductionRecord } from './monthly-operation-mock-data'
import { NO_VALUE, formatCurrency } from './monthly-operation-format'
import { formatDuration } from './monthly-production-viatics'
import { useCanApproveProduction, useCanCreateProduction } from './log-production-item'

/** The six months the client's production history covers, newest first (`YYYY-MM`). */
function lastSixMonths(today: string): string[] {
  const [year, month] = today.split('-').map(Number)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - i, 1))
    return d.toISOString().slice(0, 7)
  })
}

/** The month a production counts in: its period, or its shoot date on rows without one. */
const monthOf = (p: ProductionRecord) => p.period ?? p.date.slice(0, 7)

/** A month's productions grouped by who shot them, costliest first. */
function variableTeam(productions: ProductionRecord[]) {
  const byPerson = new Map<string, { name: string; hours: number; cost: number }>()
  for (const p of productions) {
    const key = p.creatorId ?? p.responsible ?? ''
    if (!key) continue
    const row = byPerson.get(key) ?? { name: p.responsible || 'Sin creator', hours: 0, cost: 0 }
    row.hours += p.hours
    row.cost += p.totalCost
    byPerson.set(key, row)
  }
  return [...byPerson.values()].sort((a, b) => b.cost - a.cost || b.hours - a.hours)
}

export function ClientVariableTeamCard({ client }: { client: Client }) {
  const { capabilities } = useRole()
  const showCost = hasCapability(capabilities, 'teamCost')
  // The productions read takes a production grant (built-in owner/admin hold them all); a
  // custom role without one would get a 403 and an error card about data it may not see.
  const canCreate = useCanCreateProduction()
  const canApprove = useCanApproveProduction()
  const canRead = canCreate || canApprove
  const months = lastSixMonths(todayIso())
  const [month, setMonth] = useState(months[0])
  const query = useClientProductions(client.id, canRead)
  if (!canRead) return null

  const inMonth = (query.data ?? []).filter((p) => monthOf(p) === month)
  const team = variableTeam(inMonth)
  const work = inMonth.reduce((sum, p) => sum + p.totalCost, 0)
  const viatics = inMonth.reduce((sum, p) => sum + p.viatics, 0)
  const hours = inMonth.reduce((sum, p) => sum + p.hours, 0)
  const pending = inMonth.filter((p) => p.status === 'pending').length

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-caption fg-subtle">Equipo variable</h3>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40" aria-label="Mes del equipo variable">
            {/* Explicit children: without them Radix moves the item's text node here. */}
            <SelectValue>
              <span>{periodLabel(month)}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {periodLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3">
          {query.isError ? (
            <div className="flex flex-col items-start gap-2">
              <span className="type-body-2 fg-subtle">
                No pudimos cargar las producciones. Su costo no es cero: no lo tenemos.
              </span>
              <Button variant="outlined" color="primary" size="dense" onClick={() => void query.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : query.isLoading ? (
            <span className="type-body-2 fg-subtle">Cargando producciones…</span>
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col">
                  <span className="type-caption fg-subtle">{showCost ? 'Costo del mes' : 'Horas del mes'}</span>
                  <span className="type-section fg-default tabular-nums">
                    {inMonth.length === 0 ? NO_VALUE : showCost ? formatCurrency(work + viatics) : formatDuration(hours)}
                  </span>
                  {showCost && viatics > 0 ? (
                    <span className="type-caption fg-subtle">
                      {`${formatCurrency(work)} de horas + ${formatCurrency(viatics)} de viáticos`}
                    </span>
                  ) : null}
                </div>
                <span className="type-caption fg-subtle">
                  {inMonth.length === 1 ? '1 producción' : `${inMonth.length} producciones`}
                </span>
              </div>
              {team.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {team.map((row) => (
                    <div key={row.name} className="flex items-center justify-between gap-3">
                      <span className="type-body-2 fg-default">{row.name}</span>
                      <span className="type-body-2 fg-default tabular-nums">
                        {showCost ? `${formatDuration(row.hours)} · ${formatCurrency(row.cost)}` : formatDuration(row.hours)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="type-body-2 fg-subtle">{`Sin producciones en ${periodLabel(month).toLowerCase()}.`}</span>
              )}
              {/* The Resumen's Costo counts a production's hours once it is approved, the
                  way a liquidación pays them; this list shows everything that was shot. */}
              {pending > 0 ? (
                <span className="type-caption fg-subtle">
                  {pending === 1
                    ? '1 producción sin aprobar: sus horas entran en el costo del cliente cuando se aprueba.'
                    : `${pending} producciones sin aprobar: sus horas entran en el costo del cliente cuando se aprueban.`}
                </span>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
