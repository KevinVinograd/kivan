import { useEffect, useMemo, useRef, useState } from 'react'

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  toast,
} from '@/app/components/components'
import { DatePicker } from '@/app/components/patterns'
import { todayIso } from '@/app/lib/iso-date'
import { formatMoney, formatMonthYear } from './cobranza-format'
import { fetchMonthlyFeePreview } from './receivables-api-data'
import type { MonthlyExchangeRate, MonthlyFeeGenerationResult } from './receivables-api-data'
import { CobrosGenerarMesRow, SKIP_LABEL, type Row } from './cobros-generar-mes-row'
import { CobrosGenerarMesRate } from './cobros-generar-mes-rate'
import { failureFor } from './cobros-generar-mes-outcome'
import {
  billedAmount,
  canGenerate,
  emptySelectionFrom,
  serviceLabelFor,
  chosenFrom,
  clashesWithManual,
  mayDuplicateByGuess,
  mergeRows,
  nameList,
  disabledReasonFor,
  selectableFrom,
  unresolvedFrom,
} from './cobros-generar-mes-selection'

function persistIf(description: string | undefined) {
  return description ? { duration: Infinity, closeButton: true } : {}
}

function defaultDueDate(period: string): string {
  const tenth = `${period.slice(0, 7)}-10`
  const today = todayIso()
  return today > tenth && today.slice(0, 7) === period.slice(0, 7) ? today : tenth
}

export function CobrosGenerarMesDialog({
  period,
  onGenerate,
  onClose,
}: {
  period: string
  onGenerate: (input: {
    period: string
    dueDate: string
    items: { clientId: string; service: string }[]
  }) => Promise<MonthlyFeeGenerationResult>
  onClose: () => void
}) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [withoutFee, setWithoutFee] = useState<string[]>([])
  const [exchangeRate, setExchangeRate] = useState<MonthlyExchangeRate | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [dueDate, setDueDate] = useState(() => defaultDueDate(period))
  const [submitting, setSubmitting] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [reloading, setReloading] = useState(false)
  const [reloadFailed, setReloadFailed] = useState(false)
  const rowsRef = useRef<Row[] | null>(null)
  rowsRef.current = rows

  useEffect(() => {
    setRows(null)
    setWithoutFee([])
    setExchangeRate(null)
  }, [period])

  useEffect(() => {
    let cancelled = false
    setLoadFailed(false)
    setReloadFailed(false)
    setReloading(true)
    fetchMonthlyFeePreview(period)
      .then((preview) => {
        if (cancelled) return
        setWithoutFee(preview.withoutFee)
        setExchangeRate(preview.exchangeRate)
        setRows((previous) => mergeRows(preview.items, previous))
      })
      .catch(() => {
        if (cancelled) return
        if (rowsRef.current === null) setLoadFailed(true)
        else setReloadFailed(true)
      })
      .finally(() => {
        if (!cancelled) setReloading(false)
      })
    return () => {
      cancelled = true
    }
  }, [period, reloadToken])

  const chosen = useMemo(() => chosenFrom(rows ?? []), [rows])
  const totals = useMemo(() => {
    const byCurrency = new Map<string, number>()
    for (const row of chosen) {
      const { amount, currency } = billedAmount(row)
      byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + amount)
    }
    return [...byCurrency.entries()].map(([currency, amount]) => ({ currency, amount }))
  }, [chosen])
  const hasForeignFee = (rows ?? []).some((row) => row.currency === 'USD')
  const covered = (rows ?? []).filter((row) => row.skipReason !== null)
  const awaitingRate = (rows ?? []).filter((row) => row.skipReason === 'missing_exchange_rate')
  const eligible = selectableFrom(rows ?? [])
  const unresolved = unresolvedFrom(rows ?? [])
  const emptied = emptySelectionFrom(rows ?? [])
  const clashing = eligible.filter(
    (row) => row.selected && row.service !== '' && clashesWithManual(row),
  )
  const guessWarned = eligible.filter((row) => row.selected && mayDuplicateByGuess(row))
  const allPicked = eligible.length > 0 && eligible.every((row) => row.selected)
  const valid = canGenerate(rows ?? [], dueDate)
  const disabledReason = disabledReasonFor(rows ?? [], dueDate)
  const showsDisabledReason =
    disabledReason !== null && !loadFailed && rows !== null && rows.length > 0

  function patch(clientId: string, next: Partial<Row>) {
    setRows((current) =>
      (current ?? []).map((row) => (row.clientId === clientId ? { ...row, ...next } : row)),
    )
  }

  function toggleAll(next: boolean) {
    setRows((current) =>
      (current ?? []).map((row) => {
        if (row.skipReason !== null) return row
        return { ...row, selected: next }
      }),
    )
  }

  async function handleGenerate() {
    if (!valid || submitting) return
    setSubmitting(true)
    let result: MonthlyFeeGenerationResult
    try {
      result = await onGenerate({
        period,
        dueDate,
        items: chosen.map((row) => ({
          clientId: row.clientId,
          service: serviceLabelFor(row),
          ...(row.lines !== null && row.selectedLineIds !== null
            ? { clientServiceIds: row.selectedLineIds }
            : {}),
          ...(row.productions.length > 0 ? { productionIds: row.selectedProductionIds } : {}),
        })),
      })
    } catch (error) {
      const failure = failureFor(error)
      toast.error(failure.title, {
        description: failure.description,
        ...persistIf(failure.description),
      })
      if (failure.nothingWritten) setSubmitting(false)
      return
    }

    try {
      const created = result.created.length
      const skipped = [
        ...result.skipped.map((s) => `${s.clientName} (${SKIP_LABEL[s.reason] ?? s.reason})`),
        ...unresolved.map((row) => `${row.clientName} (sin servicio)`),
        ...emptied.map((row) => `${row.clientName} (sin servicios tildados)`),
        ...clashing.map((row) => `${row.clientName} (${SKIP_LABEL.manual_exists})`),
        ...awaitingRate.map((row) => `${row.clientName} (${SKIP_LABEL.missing_exchange_rate})`),
      ].join(', ')
      const createdIds = new Set(result.created.map((r) => r.clientId))
      const repeated = guessWarned
        .filter((row) => createdIds.has(row.clientId))
        .map((row) => row.clientName)
        .join(', ')
      const description =
        [
          skipped ? `Sin generar: ${skipped}` : null,
          repeated ? `Revisá que no se repitan: ${repeated}` : null,
        ]
          .filter(Boolean)
          .join('. ') || undefined
      if (created === 0) {
        toast.warning('No se generó ningún cobro', { description, ...persistIf(description) })
      } else {
        toast.success(created === 1 ? 'Se generó 1 cobro' : `Se generaron ${created} cobros`, {
          description,
          ...persistIf(description),
        })
      }
    } catch (error) {
      console.error('La generación terminó, pero el detalle no se pudo armar', error)
      const created = result.created?.length ?? 0
      toast.warning(
        created === 0
          ? 'La generación terminó sin crear cobros, y no pudimos mostrar el detalle'
          : created === 1
            ? 'Se generó 1 cobro, pero no pudimos mostrar el detalle'
            : `Se generaron ${created} cobros, pero no pudimos mostrar el detalle`,
        {
          description: 'Recargá la página para ver el resultado',
          duration: Infinity,
          closeButton: true,
        },
      )
    }
    onClose()
  }

  const withoutFeeNotice =
    withoutFee.length > 0 ? (
      <span className="type-caption fg-subtle">
        {withoutFee.length === 1
          ? '1 cliente activo no aparece porque no tiene fee mensual cargado'
          : `${withoutFee.length} clientes activos no aparecen porque no tienen fee mensual cargado`}
        : {nameList(withoutFee)}. Si alguno debería facturarse todos los meses, cargá su fee
        en la ficha del cliente.
      </span>
    ) : null

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generar cobros del mes</DialogTitle>
          <DialogDescription>
            Un cobro por cliente con fee mensual · {formatMonthYear(period)}
          </DialogDescription>
        </DialogHeader>

        {loadFailed ? (
          <p role="alert" className="type-body-2 fg-danger">
            No se pudo cargar la lista de clientes, volvé a abrir el formulario
          </p>
        ) : rows === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          (withoutFeeNotice ?? (
            <p className="type-body-2 fg-subtle">
              Ningún cliente activo tiene un fee mensual cargado. Si alguno debería facturarse
              todos los meses, cargá su fee en la ficha del cliente.
            </p>
          ))
        ) : (
          <div className="flex flex-col gap-3">
            {hasForeignFee ? (
              <CobrosGenerarMesRate
                key={period}
                period={period}
                rate={exchangeRate}
                onSaved={() => setReloadToken((token) => token + 1)}
              />
            ) : null}

            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Vencimiento</span>
              <DatePicker value={dueDate} onChange={setDueDate} required aria-label="Vencimiento" />
            </label>

            {eligible.length > 0 ? (
              <div className="flex items-center gap-3 border-b border-alpha-subtle px-2 pb-2">
                <Checkbox
                  checked={allPicked}
                  onCheckedChange={() => toggleAll(!allPicked)}
                  aria-label="Seleccionar todo"
                />
                <span className="type-caption fg-subtle">Seleccionar todo</span>
              </div>
            ) : null}

            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {rows.map((row) => (
                <CobrosGenerarMesRow
                  key={row.clientId}
                  row={row}
                  onToggle={(selected) => patch(row.clientId, { selected })}
                  onServiceChange={(service) => patch(row.clientId, { service, selected: true })}
                  onToggleLine={(lineId, included) =>
                    patch(row.clientId, {
                      selectedLineIds: included
                        ? [...(row.selectedLineIds ?? []), lineId]
                        : (row.selectedLineIds ?? []).filter((id) => id !== lineId),
                    })
                  }
                  onToggleProduction={(productionId, included) =>
                    patch(row.clientId, {
                      selectedProductionIds: included
                        ? [...row.selectedProductionIds, productionId]
                        : row.selectedProductionIds.filter((id) => id !== productionId),
                    })
                  }
                />
              ))}
            </div>

            <div className="flex items-baseline justify-between border-t border-alpha-subtle pt-3">
              <span className="type-caption fg-subtle">
                {chosen.length} de {rows.length - covered.length} por generar
              </span>
              <span className="type-body tabular-nums fg-default">
                {totals.length === 0
                  ? formatMoney(0, 'ARS')
                  : totals.map((t) => formatMoney(t.amount, t.currency)).join(' · ')}
              </span>
            </div>
            {withoutFeeNotice}
            {unresolved.length > 0 ? (
              <span role="alert" className="type-caption fg-warning">
                {unresolved.length === 1
                  ? 'Sin servicio elegido, 1 cliente queda fuera'
                  : `Sin servicio elegido, ${unresolved.length} clientes quedan fuera`}
                : {nameList(unresolved.map((row) => row.clientName))}
              </span>
            ) : null}
            {emptied.length > 0 ? (
              <span role="alert" className="type-caption fg-warning">
                {emptied.length === 1
                  ? 'Sin servicios tildados, 1 cliente queda fuera'
                  : `Sin servicios tildados, ${emptied.length} clientes quedan fuera`}
                : {nameList(emptied.map((row) => row.clientName))}
              </span>
            ) : null}
            {clashing.length > 0 && !showsDisabledReason ? (
              <span role="alert" className="type-caption fg-warning">
                {clashing.length === 1
                  ? 'Ya tiene ese servicio cargado a mano, queda fuera'
                  : `Ya tienen ese servicio cargado a mano, ${clashing.length} quedan fuera`}
                : {nameList(clashing.map((row) => row.clientName))}
              </span>
            ) : null}
            {guessWarned.length > 0 ? (
              <span role="alert" className="type-caption fg-warning">
                {guessWarned.length === 1
                  ? 'Ya tiene un cobro cargado a mano este mes, revisá que no se repita'
                  : `Ya tienen un cobro cargado a mano este mes, revisá que no se repitan`}
                : {nameList(guessWarned.map((row) => row.clientName))}
              </span>
            ) : null}
            {awaitingRate.length > 0 && !showsDisabledReason ? (
              <span role="alert" className="type-caption fg-warning">
                {awaitingRate.length === 1
                  ? 'Falta la cotización del dólar, 1 cliente queda fuera'
                  : `Falta la cotización del dólar, ${awaitingRate.length} clientes quedan fuera`}
                : {nameList(awaitingRate.map((row) => row.clientName))}
              </span>
            ) : null}
            {reloadFailed ? (
              <span role="alert" className="type-caption fg-danger">
                No pudimos actualizar la lista, puede estar desactualizada. Cerrá y volvé a
                abrir para verla al día
              </span>
            ) : null}
            {showsDisabledReason ? (
              <span id="generar-mes-disabled-reason" role="alert" className="type-caption fg-warning">
                {disabledReason}
              </span>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="outlined" color="primary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="solid"
            color="primary"
            disabled={!valid || submitting || reloading}
            aria-describedby={showsDisabledReason ? 'generar-mes-disabled-reason' : undefined}
            onClick={handleGenerate}
          >
            {chosen.length === 0
              ? 'Generar cobros'
              : chosen.length === 1
                ? 'Generar 1 cobro'
                : `Generar ${chosen.length} cobros`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
