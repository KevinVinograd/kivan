import { useState } from 'react'

import { Button, Input, toast } from '@/app/components/components'
import { ApiError } from '@/api/client'
import { formatAmountSeed, parseAmountInput } from './clients-dialogs'
import { formatExchangeRate, formatMonthYear } from './cobranza-format'
import { setMonthlyExchangeRateViaApi, type MonthlyExchangeRate } from './receivables-api-data'

export function CobrosGenerarMesRate({
  period,
  rate,
  onSaved,
}: {
  period: string
  rate: MonthlyExchangeRate | null
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(rate === null)
  const [value, setValue] = useState(() => formatAmountSeed(rate?.arsPerUsd))
  const [saving, setSaving] = useState(false)

  const parsed = parseAmountInput(value)
  const valid = parsed > 0

  async function handleSave() {
    if (!valid || saving) return
    setSaving(true)
    try {
      await setMonthlyExchangeRateViaApi(period, parsed)
      toast.success('Cotización guardada')
      setEditing(false)
      onSaved()
    } catch (error) {
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
