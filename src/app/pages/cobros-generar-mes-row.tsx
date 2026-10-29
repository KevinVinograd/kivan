import {
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/components'
import type { MonthlyFeeSkipReason } from '@/api/receivables'
import { formatMoney } from './cobranza-format'
import {
  billedAmount,
  clashesWithManual,
  emptySelectionFrom,
  hasPricedLines,
  linesOf,
  needsServicePick,
  unresolvedFrom,
  mayDuplicateByGuess,
  serviceOptionsFor,
  type GenerarMesRow,
} from './cobros-generar-mes-selection'

export const SKIP_LABEL: Record<MonthlyFeeSkipReason, string> = {
  already_generated: 'Ya generado',
  manual_exists: 'Cargado a mano',
  not_billable: 'Ya no corresponde',
  missing_exchange_rate: 'Falta la cotización',
}

export type Row = GenerarMesRow

export function CobrosGenerarMesRow({
  row,
  onToggle,
  onServiceChange,
  onToggleLine,
  onToggleProduction,
}: {
  row: Row
  onToggle: (selected: boolean) => void
  onServiceChange: (service: string) => void
  onToggleLine: (lineId: string, included: boolean) => void
  onToggleProduction: (productionId: string, included: boolean) => void
}) {
  const blocked = row.skipReason !== null
  const billed = billedAmount(row)
  const unresolved = unresolvedFrom([row]).length > 0
  const emptied = !blocked && emptySelectionFrom([row]).length > 0
  const droppedFor = clashesWithManual(row) ? row.service || row.suggestedService : null
  const mayRepeat = mayDuplicateByGuess(row) ? row.manualServices.join(', ') : null

  return (
    <div className="flex items-center gap-3 rounded-control px-2 py-2 hover:bg-alpha-subtle-hover">
      <Checkbox
        checked={row.selected && !blocked}
        disabled={blocked}
        onCheckedChange={(next) => onToggle(next === true)}
        aria-label={row.clientName}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="type-button truncate fg-default">{row.clientName}</span>
        {blocked ? (
          <span className="type-caption fg-subtle">
            {SKIP_LABEL[row.skipReason as MonthlyFeeSkipReason]}
          </span>
        ) : unresolved ? (
          <span className="type-caption fg-warning">Queda fuera, sin servicio elegido</span>
        ) : emptied ? (
          <span className="type-caption fg-warning">
            Queda fuera, sin servicios tildados
          </span>
        ) : droppedFor ? (
          <span className="type-caption fg-warning">
            Ya tiene ese servicio cargado a mano, queda fuera: {droppedFor}
          </span>
        ) : mayRepeat ? (
          <span className="type-caption fg-warning">
            Ya tiene un cobro cargado a mano este mes: {mayRepeat}
          </span>
        ) : row.suggestedService ? (
          <span className="type-caption fg-subtle">{row.suggestedService}</span>
        ) : row.services.length === 0 &&
          row.service === '' &&
          !hasPricedLines(row) &&
          row.productions.length === 0 ? (
          <span className="type-caption fg-subtle">Sin servicios contratados</span>
        ) : null}
      </div>
      {!blocked && (hasPricedLines(row) || row.productions.length > 0) ? (
        <div className="flex min-w-0 flex-col gap-1">
          {linesOf(row).map((line) => {
            const included = row.selectedLineIds?.includes(line.id) ?? false
            return (
              <label key={line.id} className="flex items-center gap-2">
                <Checkbox
                  checked={included}
                  onCheckedChange={(next) => onToggleLine(line.id, next === true)}
                  aria-label={`${line.name} de ${row.clientName}`}
                />
                <span className="type-caption fg-subtle">{line.name}</span>
                <span className="type-caption tabular-nums fg-subtle">
                  {formatMoney(line.price, row.currency)}
                </span>
              </label>
            )
          })}
          {row.productions.map((production) => {
            const included = row.selectedProductionIds.includes(production.id)
            return (
              <label key={production.id} className="flex items-center gap-2">
                <Checkbox
                  checked={included}
                  onCheckedChange={(next) => onToggleProduction(production.id, next === true)}
                  aria-label={`${production.serviceName}, ${production.title}, de ${row.clientName}`}
                />
                <span className="type-caption fg-subtle">
                  {production.serviceName} · {production.title}
                </span>
                <span className="type-caption tabular-nums fg-subtle">
                  {formatMoney(production.amount, row.currency)}
                </span>
              </label>
            )
          })}
        </div>
      ) : null}
      {!blocked && needsServicePick(row) && !row.suggestedService ? (
        <Select value={row.service} onValueChange={onServiceChange}>
          <SelectTrigger className="w-40" aria-label={`Servicio de ${row.clientName}`}>
            <SelectValue placeholder="Elegí el servicio">
              <span>{row.service}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {serviceOptionsFor(row).map((service) => (
              <SelectItem key={service} value={service}>
                {service}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <div className="flex flex-col items-end">
        <span className={`type-body-2 tabular-nums ${blocked ? 'fg-subtle' : 'fg-default'}`}>
          {formatMoney(billed.amount, billed.currency)}
        </span>
        {row.convertedArs === null ? null : (
          <span className="type-caption tabular-nums fg-subtle">
            {formatMoney(row.monthlyFee, row.currency)}
          </span>
        )}
        {row.discountPercent && row.discountAmount !== null ? (
          <span className="type-caption tabular-nums fg-subtle">
            {`Con ${row.discountPercent}% de descuento`}
          </span>
        ) : null}
      </div>
    </div>
  )
}
