import { useState } from 'react'

import { Button, Input, toast } from '@/app/components/components'
import { ApiError } from '@/api/client'
import { formatAmountSeed, parseAmountInput } from './clients-dialogs'
import { formatExchangeRate, formatMonthYear } from './cobranza-format'
import { setMonthlyExchangeRateViaApi, type MonthlyExchangeRate } from './receivables-api-data'

/**
 * The dollar rate a month is billed at, inside the generator that uses it.
 *
 * WHY IT LIVES HERE. Some retainers are priced in USD and invoiced in pesos, at a rate the
 * studio fixes on the first business day. That rate is needed at exactly one moment — the
 * one the operator is already in — so putting it behind a settings page would mean leaving
 * the dialog, finding the section, and coming back to a roster that still says "falta la
 * cotización". It is asked for where it is spent.
 *
 * WHAT IT PROMISES. Saving stores the rate and nothing else: the cobros are still created
 * by the button below. And what it stores is a STAMP — the cobros generated afterwards
 * record this number, and changing it later does not reprice them. The helper text says
 * so, because "cotización del mes" otherwise reads like a setting the whole month follows.
 */
export function CobrosGenerarMesRate({
  period,
  rate,
  onSaved,
}: {
  period: string
  rate: MonthlyExchangeRate | null
  /** Re-read the preview. The converted amounts and the skip reasons are the server's,
   *  so they are refetched rather than recomputed here from the value just typed. */
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(rate === null)
  // Seeded and read through the pair `clients-dialogs.tsx` exports, which are exact
  // inverses of each other. `String(1234.5)` here would seed "1234.5", whose dot the
  // parser strips as a thousands separator, so merely touching the field would re-read a
  // stored 1.234,50 as 12.345 and save it with a success toast.
  const [value, setValue] = useState(() => formatAmountSeed(rate?.arsPerUsd))
  const [saving, setSaving] = useState(false)

  const parsed = parseAmountInput(value)
  const valid = parsed > 0

  async function handleSave() {
    if (!valid || saving) return
    setSaving(true)
    try {
      await setMonthlyExchangeRateViaApi(period, parsed)
      // Only after the server confirmed the write. The roster is refetched rather than
      // patched locally, so what the rows show is what the generator will use.
      toast.success('Cotización guardada')
      setEditing(false)
      onSaved()
    } catch (error) {
      // The server's own words and the status, so a failure here can be read off a
      // screenshot instead of being reported as "no anduvo".
      const detail =
        error instanceof ApiError ? ` Detalle: ${error.message} (HTTP ${error.status})` : ''
      toast.error('No se pudo guardar la cotización', {
        description: `La cotización quedó como estaba, probá de nuevo.${detail}`,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-control bg-surface-flat p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="type-caption fg-subtle">
          Cotización del dólar para {formatMonthYear(period).toLowerCase()}
        </span>
        {rate && !editing ? (
          <Button variant="transparent" color="primary" onClick={() => setEditing(true)}>
            Cambiar
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <Input
            // Not type="number", per the rule `clients-dialogs.tsx` states for every money
            // field here: it renders spinner arrows, refuses a free-typed amount, and keeps
            // a leading zero on an empty field. It also cannot hold the Argentine decimal
            // comma at all, so an operator typing "1234,50" would get an empty value and a
            // disabled button with nothing on screen explaining why.
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value.replace(/[^\d.,]/g, ''))}
            placeholder="1234,50"
            aria-label="Cotización del dólar"
          />
          <Button variant="solid" color="primary" disabled={!valid || saving} onClick={handleSave}>
            {saving ? 'Guardando' : 'Guardar'}
          </Button>
          {rate ? (
            <Button
              variant="outlined"
              color="primary"
              disabled={saving}
              onClick={() => {
                setValue(formatAmountSeed(rate.arsPerUsd))
                setEditing(false)
              }}
            >
              Cancelar
            </Button>
          ) : null}
        </div>
      ) : (
        <span className="type-body-2 tabular-nums fg-default">
          {rate ? `${formatExchangeRate(rate.arsPerUsd)} por USD` : 'Sin cargar'}
        </span>
      )}

      <span className="type-caption fg-subtle">
        {rate === null
          ? 'Los clientes con abono en dólares no se pueden generar hasta que la cargues'
          : 'Queda guardada en los cobros que generes ahora. Si después la cambiás, esos cobros no cambian'}
      </span>
    </div>
  )
}
