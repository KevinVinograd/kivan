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

/**
 * Keep a toast up until it is dismissed, whenever it carries something to act on.
 *
 * A run's only record of who was not billed — or who may have been billed twice — is that
 * description, and `onClose` destroys the dialog that showed it. Sonner's four seconds is
 * not enough to read a list of six clients, let alone act on it. The close button is
 * explicit because the app's Toaster does not enable one globally, and an infinite toast
 * without one holds its slot for the rest of the session.
 */
function persistIf(description: string | undefined) {
  return description ? { duration: Infinity, closeButton: true } : {}
}

/** The 10th of the period's month — the day the studio's abonos usually fall due — or today
 *  once the 10th has passed, so a month generated late does not create its cobros already
 *  overdue (25/10 review). A default, not a rule: the picker below is the one that decides. */
function defaultDueDate(period: string): string {
  const tenth = `${period.slice(0, 7)}-10`
  const today = todayIso()
  return today > tenth && today.slice(0, 7) === period.slice(0, 7) ? today : tenth
}

/**
 * Generar cobros del mes — turn each active client's `monthlyFeeMinor` into a cobro for
 * the period, in one action.
 *
 * The retainer had been stored on the client since the form shipped and read by nothing,
 * so every month someone retyped the whole roster by hand. This is the surface that
 * closes that gap, and it is deliberately a PREVIEW before a write: a bulk money action
 * must never be a blind click, so the operator sees who will be billed, for how much,
 * and — named rather than silently dropped — who will be skipped and why.
 *
 * Amounts are read-only here on purpose. The server re-reads each fee inside the
 * transaction and ignores anything the browser might have sent, so an editable field
 * would be a promise this dialog cannot keep.
 */
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
  // Active clients the generator cannot even offer, because they carry no fee. Named
  // rather than left to a silent gap between "29 activos" and a roster of 21.
  const [withoutFee, setWithoutFee] = useState<string[]>([])
  // The month's dollar rate, as the server holds it. Carried by the preview, so it is
  // always the number the generator would actually use.
  const [exchangeRate, setExchangeRate] = useState<MonthlyExchangeRate | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [dueDate, setDueDate] = useState(() => defaultDueDate(period))
  const [submitting, setSubmitting] = useState(false)
  // Bumped to re-read the preview after the rate is saved. The converted amounts and the
  // skip reasons are the server's, so they are refetched rather than recomputed here.
  const [reloadToken, setReloadToken] = useState(0)
  // True while a preview fetch is in flight. It gates Generar: between saving the rate and
  // the roster coming back, `chosen` is still the PRE-rate list, so a click in that window
  // sends a request with the dollar clients missing and reports full success.
  const [reloading, setReloading] = useState(false)
  // A reload that failed. Separate from `loadFailed` because it must not blank the dialog.
  const [reloadFailed, setReloadFailed] = useState(false)
  // Read inside the fetch's catch, which closes over the render it was created in and would
  // otherwise see a stale `rows`. Only used to tell a first load from a reload.
  const rowsRef = useRef<Row[] | null>(null)
  rowsRef.current = rows

  // A different period is a different roster. Cleared FIRST (this effect is declared
  // before the fetch below, and effects run in order), so the merge on arrival has nothing
  // of the previous month to carry over and the skeleton shows meanwhile.
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
        // Merged, not replaced. A reload here is usually the operator having just loaded
        // the month's rate, and it must not cost them the ticks and services they already
        // chose. The rules live in `mergeRows` (and `opensTicked`), where they are tested.
        setRows((previous) => mergeRows(preview.items, previous))
      })
      // A failed fetch and an empty roster are not the same thing, and only one of them
      // is fixed by "cargá el fee en Clientes".
      //
      // A RELOAD failure is a different event again, and must not take the same branch. The
      // roster on screen is still good and the operator has curated it; replacing 24 rows,
      // their services and the vencimiento with "volvé a abrir el formulario" because a
      // refetch blipped is destructive, and the reload runs right after a "Cotización
      // guardada" toast. Only the FIRST load, which has nothing to keep, clears the dialog.
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
  // Per currency, never one number. A client's retainer is denominated in that client's
  // own currency, so adding a USD fee to a peso one produced a total that was neither.
  const totals = useMemo(() => {
    const byCurrency = new Map<string, number>()
    for (const row of chosen) {
      // What will be BILLED, which for a converted retainer is the peso figure and not the
      // dollar one. So a roster billed entirely in pesos totals to one number even when
      // some of its clients are priced in dollars, which is the truth about the month.
      // The per-currency map still stands for the case it was written for: a client billed
      // in its own currency, which is anything the rate does not cover.
      // Net of the client's standing discount, because that is what the run writes. A
      // gross total here would have the operator approve one number and the generator
      // create another, with nothing on screen explaining the gap.
      const { amount, currency } = billedAmount(row)
      byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + amount)
    }
    return [...byCurrency.entries()].map(([currency, amount]) => ({ currency, amount }))
  }, [chosen])
  // Whether the month's rate is a question this studio has to answer at all.
  //
  // USD, not "anything that is not ARS". The two coincide today, because USD is the only
  // non-peso lane `Currency` has and it is the only one `priceFor` reprices. They stopped
  // coinciding once before: a roster whose one non-peso client was FCI raised a dollar
  // rate block for a client the rate could not affect, and loading one changed nothing.
  // Naming the lane keeps that from returning with the next lane added.
  const hasForeignFee = (rows ?? []).some((row) => row.currency === 'USD')
  const covered = (rows ?? []).filter((row) => row.skipReason !== null)
  // Retainers this run will NOT bill because the month has no rate for them. Unlike the
  // other skip reasons these are not "already handled" -- the client is owed a cobro and is
  // not getting one -- so they are named on screen and again in the toast, the same as
  // `unresolved` and `clashing`. They never reach the request (`chosenFrom` drops any
  // blocked row), so the server has nothing to skip and reports an empty list: without this
  // the run says "Se generaron 20 cobros" with four retainers silently unbilled.
  const awaitingRate = (rows ?? []).filter((row) => row.skipReason === 'missing_exchange_rate')
  const eligible = selectableFrom(rows ?? [])
  // Ticked but with no service chosen. These LEAVE the run rather than blocking it: one
  // client nobody can resolve used to disable generation for every other client on screen.
  // They are still named, and marked in their own row, because a bulk money action must
  // never quietly bill less than the operator believes it ticked.
  const unresolved = unresolvedFrom(rows ?? [])
  // Priced rows the operator emptied of every service. They fall into NEITHER of the
  // other two lists — `unresolvedFrom` keys on an empty `service`, which a priced row
  // never has — so without this they left the run with their checkbox still ticked and
  // nothing anywhere saying the client was not billed.
  const emptied = emptySelectionFrom(rows ?? [])
  // Ticked, resolved, and still not billable: the period already carries a hand-made cobro
  // for that exact service, so the run will skip it no matter what this dialog does.
  const clashing = eligible.filter(
    (row) => row.selected && row.service !== '' && clashesWithManual(row),
  )
  // WILL be billed, but the service label is a catalog guess and the client already has a
  // hand-made cobro this period. Only the operator can tell whether those are the same
  // money, so it is said rather than decided.
  const guessWarned = eligible.filter((row) => row.selected && mayDuplicateByGuess(row))
  // The header measures exactly the set `toggleAll` ticks, which is exactly the enabled
  // checkboxes. Any narrowing here puts the box out of step with the rows.
  const allPicked = eligible.length > 0 && eligible.every((row) => row.selected)
  const valid = canGenerate(rows ?? [], dueDate)
  const disabledReason = disabledReasonFor(rows ?? [], dueDate)
  // The reason only RENDERS alongside a populated roster. While loading, after a failed
  // load, or with nothing to bill, pointing the button at it would leave a dangling IDREF
  // that reads as nothing at all to a screen reader.
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
        // Blocked rows are never the operator's to pick: already covered this period, so
        // ticking them would send the server a client it is going to skip anyway. This is
        // the ONLY exclusion, deliberately — see `selectableFrom`.
        if (row.skipReason !== null) return row
        return { ...row, selected: next }
      }),
    )
  }

  async function handleGenerate() {
    if (!valid || submitting) return
    setSubmitting(true)
    // The try covers the REQUEST and nothing else. It used to wrap the whole handler, which
    // made one `catch` answer for two opposite outcomes: the run was refused, and the run
    // LANDED but the reporting below threw. Both rendered "No se pudieron generar los
    // cobros", so 23 created cobros could be reported as none, with the dialog left open
    // inviting a second click on a month that was already billed.
    let result: MonthlyFeeGenerationResult
    try {
      result = await onGenerate({
        period,
        dueDate,
        items: chosen.map((row) => ({
          clientId: row.clientId,
          // Derived, so a priced client with several contracted labels is billable at all
          // and a single-service month is filed under that service's own name.
          service: serviceLabelFor(row),
          // Sent ONLY when this API said it has lines. A server that predates the field
          // strips unknown keys silently (zod), so a browser that sent ids anyway would
          // have the full retainer billed while the screen showed a subset.
          ...(row.lines !== null && row.selectedLineIds !== null
            ? { clientServiceIds: row.selectedLineIds }
            : {}),
          // Only when the preview offered productions: the server bills none it is not
          // sent, so an empty or absent list is the honest request for a row without them.
          ...(row.productions.length > 0 ? { productionIds: row.selectedProductionIds } : {}),
        })),
      })
    } catch (error) {
      // BOUND, not discarded. `ApiError` carries the status and the server's own message,
      // and throwing them away is why a production failure of this action arrived with no
      // evidence attached. `failureFor` also decides what may be CLAIMED about the batch:
      // only a status this API mints proves the transaction rolled back.
      const failure = failureFor(error)
      toast.error(failure.title, {
        description: failure.description,
        ...persistIf(failure.description),
      })
      // Re-arm "Generar" ONLY where a retry is known to be safe. On the outcomes we cannot
      // resolve, the toast says to reload and check first, and a button that lights up
      // underneath it says the opposite. The server skips a client that already carries a
      // generated cobro for the period, so a second run cannot double-bill, but it can very
      // easily convince the operator that a month billed correctly was never billed at all.
      if (failure.nothingWritten) setSubmitting(false)
      return
    }

    // Past this line the write LANDED. Nothing below may report it as a failure.
    try {
      // Report what the run DID, not what it was asked to do. A client can stop being
      // billable between the preview and the write, and a flat "listo" would hide it.
      const created = result.created.length
      // BY NAME, and including the ones THIS DIALOG left out — not only the ones the server
      // reported. Dropping the batch veto made partial runs possible, and the rows we filter
      // client-side never reach the request, so the server has nothing to skip and reports
      // an empty list: "Se generaron 15 cobros" with 6 retainers silently unbilled, and
      // `onClose` then wipes the warning that named them. A bulk money action must never
      // quietly bill less than the operator ticked, and the toast is the last place to say so.
      const skipped = [
        ...result.skipped.map((s) => `${s.clientName} (${SKIP_LABEL[s.reason] ?? s.reason})`),
        ...unresolved.map((row) => `${row.clientName} (sin servicio)`),
        ...emptied.map((row) => `${row.clientName} (sin servicios tildados)`),
        ...clashing.map((row) => `${row.clientName} (${SKIP_LABEL.manual_exists})`),
        ...awaitingRate.map((row) => `${row.clientName} (${SKIP_LABEL.missing_exchange_rate})`),
      ].join(', ')
      // These WERE billed, and were flagged on screen as possibly repeating a hand-made
      // cobro. `onClose` is about to destroy that warning, so it rides along here: the
      // rule is that nothing about this batch is left only to a dialog that is closing.
      //
      // Intersected with what the run ACTUALLY created. A client can stop being billable
      // between the preview and the write, and listing it under both "sin generar" and
      // "revisá que no se repita" in one toast contradicts itself.
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
      // The batch is already in the database. Whatever broke is OUR reporting of it, so the
      // operator is told what is true (the cobros exist) and what to do about the part that
      // is not (reload to see them). Calling this a failure would be the phantom-write bug
      // in reverse, and more expensive: it invites a second run on a billed month.
      console.error('La generación terminó, pero el detalle no se pudo armar', error)
      // The COUNT, not a blanket "se generaron". A run that landed and created nothing is
      // an outcome this dialog already has a branch for fifteen lines up, and claiming
      // cobros exist because the reporting broke would be its own small lie.
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

  // Deliberately CONDITIONAL, not an instruction. A client with no monthly fee is often a
  // project-only client that is correctly excluded, and the preview cannot tell those from
  // a retainer nobody loaded — so "cargá el fee en Clientes" as a flat directive would talk
  // an operator into turning the first kind into the second.
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
          // With names to show, the notice already says the same thing AND says WHO, so
          // the static sentence would only repeat "Se define en la ficha del cliente".
          (withoutFeeNotice ?? (
            <p className="type-body-2 fg-subtle">
              Ningún cliente activo tiene un fee mensual cargado. Si alguno debería facturarse
              todos los meses, cargá su fee en la ficha del cliente.
            </p>
          ))
        ) : (
          <div className="flex flex-col gap-3">
            {/* Only where it is actually spent. A studio whose whole roster is priced in
                pesos never has a rate to load, and a field asking for one would be a
                permanent unanswered question on a screen about something else. */}
            {hasForeignFee ? (
              <CobrosGenerarMesRate
                // Keyed so a period change REMOUNTS it. Its editing state and its input
                // are seeded from the rate it opened with, and carrying October's number
                // into November's field is how a month gets billed at the wrong rate.
                key={period}
                period={period}
                rate={exchangeRate}
                onSaved={() => setReloadToken((token) => token + 1)}
              />
            ) : null}

            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Vencimiento</span>
              {/* `required` rather than a bare `clearable={false}`: the run is gated on this
                  date, so the trigger must carry aria-required too. Not clearing follows
                  from being required, which is the pairing the convention states. */}
              <DatePicker value={dueDate} onChange={setDueDate} required aria-label="Vencimiento" />
            </label>

            {/* Rendered whenever any row can be picked at all. Gating it on a NARROWER set
                once took the bulk deselect away with it, leaving ticked rows, a dead button
                and no bulk control. */}
            {eligible.length > 0 ? (
              <div className="flex items-center gap-3 border-b border-alpha-subtle px-2 pb-2">
                {/* Deliberately NOT Radix's 'indeterminate'. `checkbox.tsx` styles only
                    `data-[state=checked]`, so the partial state renders unchecked chrome
                    while the indicator still mounts the full check glyph: a tick on an
                    unfilled box. In a money batch that ambiguity is worse than no partial
                    state at all, since it invites a click that re-ticks the very clients
                    the operator just excluded. */}
                {/* Decides by what is on screen, not by Radix's `next` — which is always
                    `true` once nothing is bulk-tickable, so the click did nothing. SELECT
                    while there is anything left to tick, CLEAR otherwise. Keying it off
                    "anything selected" instead was worse: in the dialog's normal mixed
                    state the first click would have UNTICKED the pre-selected retainers. */}
                {/* Decides by what is on screen, not by Radix's `next`: select while
                    anything is left to tick, clear once everything is. Now that the header
                    measures the same set it ticks, `allPicked` alone answers that. */}
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
                  // Picking a service TICKS the row. These rows deliberately open unticked
                  // (`opensTicked` refuses to guess), which makes the Select the affordance
                  // that resolves them — and resolving one without selecting it left the
                  // client out of the run with the caption chain falling through to
                  // nothing, so neither the screen nor the toast said it went unbilled.
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
            {/* `role="alert"`, like the message it replaced. Clients dropped from a money
                batch have to be ANNOUNCED, not just drawn. */}
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
            {/* Same reason the unresolved list is announced: a client dropped from a money
                batch must be summarised where the operator is looking, not only captioned
                inside a scroll box they may never reach. */}
            {/* Suppressed while the disabled reason is up: that line names the same clients
                AND says what to do about them, so showing both put two `role="alert"`
                messages on screen giving different advice about one row. */}
            {clashing.length > 0 && !showsDisabledReason ? (
              <span role="alert" className="type-caption fg-warning">
                {clashing.length === 1
                  ? 'Ya tiene ese servicio cargado a mano, queda fuera'
                  : `Ya tienen ese servicio cargado a mano, ${clashing.length} quedan fuera`}
                : {nameList(clashing.map((row) => row.clientName))}
              </span>
            ) : null}
            {/* These WILL be billed. Said, not decided: only the operator knows whether a
                guessed label and a hand-made cobro are the same money. */}
            {guessWarned.length > 0 ? (
              <span role="alert" className="type-caption fg-warning">
                {guessWarned.length === 1
                  ? 'Ya tiene un cobro cargado a mano este mes, revisá que no se repita'
                  : `Ya tienen un cobro cargado a mano este mes, revisá que no se repitan`}
                : {nameList(guessWarned.map((row) => row.clientName))}
              </span>
            ) : null}
            {/* Same rule as the two lists above, and the reason this one exists: these
                clients are OWED a cobro and are not getting one. They never reach the
                request, so the server reports no skip, and without this line the run would
                close on "Se generaron 20 cobros" with four retainers unbilled and unnamed.
                Suppressed only when the disabled reason is already saying it. */}
            {awaitingRate.length > 0 && !showsDisabledReason ? (
              <span role="alert" className="type-caption fg-warning">
                {awaitingRate.length === 1
                  ? 'Falta la cotización del dólar, 1 cliente queda fuera'
                  : `Falta la cotización del dólar, ${awaitingRate.length} clientes quedan fuera`}
                : {nameList(awaitingRate.map((row) => row.clientName))}
              </span>
            ) : null}
            {/* A reload that failed. The roster on screen is intact and still generatable,
                so this says what is stale rather than replacing the dialog with an error. */}
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
            // `reloading` too: while a refetch is in flight `chosen` is still the roster
            // from BEFORE it, so a click in that window sends the pre-rate list. Right after
            // saving the rate that means generating without the dollar clients the rate was
            // loaded for, and reporting it as a clean run.
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
