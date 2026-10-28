import { SERVICE_CATALOG } from './clients-mock-data'
import type { MonthlyFeeCandidate } from './receivables-api-data'

/**
 * A preview candidate plus the things the operator controls about it.
 *
 * `selectedLineIds` is null for a client with no priced services — the row bills its
 * whole retainer under `service`, exactly as it did before pricing existed. For a client
 * WITH lines it is the subset being billed this month, which is how "deducir servicios
 * brindados o no para un mes en particular" is expressed without touching the contract.
 */
export type GenerarMesRow = MonthlyFeeCandidate & {
  selected: boolean
  service: string
  selectedLineIds: string[] | null
  /** The pending productions being billed on this cobro. All of them by default. */
  selectedProductionIds: string[]
}

/** The client's lines, or an empty list when it has none / the API predates them. */
export function linesOf(row: GenerarMesRow): { id: string; name: string; price: number }[] {
  return row.lines ?? []
}

/** Whether this row can offer a per-service checklist at all. */
export function hasPricedLines(row: GenerarMesRow): boolean {
  return (row.lines?.length ?? 0) > 0
}

/**
 * Whether the cobro is ITEMIZED: made of priced monthly lines, of productions, or both.
 * An itemized row derives its label from what is ticked and never needs the service
 * picker; a client billed for productions alone has no lines but is itemized all the same.
 */
export function isItemized(row: GenerarMesRow): boolean {
  return hasPricedLines(row) || row.productions.length > 0
}

/**
 * Whether the operator has to PICK the label this cobro is filed under: only when it
 * carries a hand-typed retainer. Priced lines name themselves, and a cobro of productions
 * alone is filed under their service.
 */
export function needsServicePick(row: GenerarMesRow): boolean {
  return !hasPricedLines(row) && row.monthlyFee > 0
}

/** The productions this row will actually bill. */
export function selectedProductionsOf(row: GenerarMesRow): GenerarMesRow['productions'] {
  return row.productions.filter((p) => row.selectedProductionIds.includes(p.id))
}

/** The lines this row will actually bill. */
export function selectedLinesOf(row: GenerarMesRow): { id: string; name: string; price: number }[] {
  if (row.selectedLineIds === null) return []
  return linesOf(row).filter((l) => row.selectedLineIds!.includes(l.id))
}

/**
 * The label the cobro will carry.
 *
 * For a PRICED client this is derived from the selection, never from the client's
 * `services` array — that array holds free-text labels and `suggestedService` is null
 * unless it has exactly one, so a priced client with two labels resolved to `''`, was
 * dropped by `chosenFrom`, and had no picker to fix it with (the Select is hidden once a
 * row is priced). Ticked, unbillable, and no control on screen: the exact shape of the
 * dead Generar button this module was written to prevent.
 *
 * One selected service bills under ITS OWN name, which also lets the duplicate guard
 * match a hand-made cobro for the same service. Several bill under a summary label.
 */
export function serviceLabelFor(row: GenerarMesRow): string {
  // A hand-typed retainer (no priced line) keeps the label picked for it, productions or not.
  if (!isItemized(row) || (!hasPricedLines(row) && row.monthlyFee > 0)) return row.service
  const selected = selectedLinesOf(row)
  if (selected.length === 1) return selected[0]!.name
  if (selected.length > 1) return 'Abono mensual'
  // No retainer line ticked: a hand-typed retainer keeps its own label, and a cobro of
  // productions alone is filed under their service, or a summary when there are several.
  const productions = selectedProductionsOf(row)
  if (productions.length === 0) return ''
  const names = [...new Set(productions.map((p) => p.serviceName))]
  return names.length === 1 ? names[0]! : 'Producciones'
}

/**
 * Priced rows the operator ticked but emptied of every service.
 *
 * They leave the run, so they must be NAMED. Reported separately from `unresolvedFrom`
 * because that one keys on an empty `service`, which a priced row never has — so an
 * emptied row fell through both lists and was dropped in silence, with its checkbox
 * still ticked. A bulk money action must never quietly bill less than it appears to.
 */
export function emptySelectionFrom(rows: GenerarMesRow[]): GenerarMesRow[] {
  return rows.filter(
    (row) =>
      row.selected &&
      row.skipReason === null &&
      isItemized(row) &&
      (row.selectedLineIds?.length ?? 0) === 0 &&
      row.selectedProductionIds.length === 0 &&
      // A hand-typed retainer still bills when no production is ticked.
      (hasPricedLines(row) || row.monthlyFee === 0),
  )
}

/**
 * What this row will actually be billed, and in which currency.
 *
 * Three things stack: the retainer, the dollar conversion when there is one, and the
 * client's standing discount. The row caption and the dialog's per-currency total both
 * read from here rather than each doing the arithmetic, because the failure this
 * prevents is a total the operator approves that is not the total the run writes.
 *
 * The discount is RECOMPUTED here rather than taken from `discountAmount`, because that
 * figure is the server's answer for the WHOLE retainer. Subtracting it from a subset
 * base is an approve-one/bill-another bug: untick a $40.000 service on a $100.000 client
 * with 10% off and the screen would say $50.000 while the run writes $54.000.
 *
 * In MINOR units, with the server's own formula (floor the DISCOUNT, then subtract), so
 * the two agree to the centavo. Flooring the net in pesos instead is the exact defect
 * `netMonthlyFee` was already bitten by.
 */
export function billedAmount(row: GenerarMesRow): { amount: number; currency: string } {
  const currency = row.convertedArs === null ? row.currency : 'ARS'
  const lines = linesOf(row)
  // The contracted figure being billed: the ticked lines when there are lines, else the
  // whole retainer. Note this is the CONTRACT amount — the conversion below is applied
  // proportionally, the same way the server converts the sum rather than each part.
  const retainer =
    row.selectedLineIds === null || lines.length === 0
      ? row.monthlyFee
      : lines
          .filter((l) => row.selectedLineIds!.includes(l.id))
          .reduce((sum, l) => sum + l.price, 0)
  // Productions are contract money like the lines, and are converted alongside them.
  const contracted = retainer + selectedProductionsOf(row).reduce((sum, p) => sum + p.amount, 0)
  const grossFull = row.convertedArs ?? row.monthlyFee
  // Scale the converted total by the share being billed, so a dollar client's subset is
  // expressed in the same pesos the server will arrive at. A dollar client with no
  // retainer has no share to scale by, so its productions take the month's rate directly.
  const gross =
    row.convertedArs === null
      ? contracted
      : row.monthlyFee === 0
        ? contracted * (row.arsPerUsd ?? 0)
        : (grossFull * contracted) / row.monthlyFee
  const baseMinor = Math.round(gross * 100)
  const discountMinor = row.discountPercent
    ? Math.floor((baseMinor * Math.round(row.discountPercent * 100)) / 10_000)
    : 0
  return { amount: Math.max(baseMinor - discountMinor, 0) / 100, currency }
}

/**
 * Name a set of clients without letting it run the width of the dialog. Past three the
 * list stops being read and starts reflowing whatever it sits in, so the tail is a count.
 */
export function nameList(names: string[]): string {
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} y ${names.length - 3} más`
}

/**
 * The services a row can be billed under.
 *
 * A client who contracts nothing on record still has to be billable: migration 0011 added
 * `Client.services` to an already-loaded roster with no backfill, so most rows carry an
 * empty array while the retainer they DO have is real. Falling back to the full catalog is
 * the same answer the hand-made cobro reached, and the server never validates the chosen
 * service against the client's array, so the two paths cannot disagree.
 */
export function serviceOptionsFor(row: GenerarMesRow): string[] {
  return row.services.length > 0 ? row.services : [...SERVICE_CATALOG]
}

/**
 * Whether a freshly loaded candidate opens ticked.
 *
 * Only where a service RESOLVES from the client's own contract. Not a safety rule — the
 * server refuses same-service duplicates whatever the browser sends — but an honesty one:
 * the catalog fallback is a GUESS at what the retainer covers, and a bulk money action must
 * not make that guess silently on the operator's behalf. Those rows are one click away, and
 * "Seleccionar todo" is the answer to having to click them one by one.
 *
 * Extracted from the dialog so it can be TESTED. Inline in a `useEffect` it could have been
 * reverted to a bare `skipReason === null` — re-arming a 21-client bulk bill under guessed
 * services — with the whole suite still green.
 */
export function opensTicked(candidate: MonthlyFeeCandidate): boolean {
  // A client with PRICED services is resolved by definition: the operator already said
  // what each service costs, so there is nothing left to guess. Without this clause the
  // clients they just finished pricing would be the ones opening UNTICKED — the rule
  // below keys on a single contracted service, and a priced client usually has several.
  if ((candidate.lines?.length ?? 0) > 0 || candidate.productions.length > 0) {
    return candidate.skipReason === null
  }
  return candidate.skipReason === null && candidate.suggestedService !== null
}

/**
 * Fold a freshly fetched roster into the one on screen, keeping what the operator chose.
 *
 * The dialog re-reads the preview after the month's dollar rate is saved, because the
 * converted amounts and the skip reasons are the SERVER's answer and recomputing them here
 * from the number just typed would be the dialog vouching for a write it has not read back.
 * Re-reading must not cost the operator their ticks and service picks.
 *
 * Two rows are treated as fresh rather than merged:
 *   - one that was not on screen before (nothing to keep),
 *   - one that WAS blocked and no longer is. Its `selected: false` was never a choice, it
 *     was a disabled checkbox — and this is exactly the dollar client that the rate just
 *     unblocked, so carrying that false through would leave the roster looking unchanged
 *     after the one action taken to change it.
 *
 * A row that became blocked loses its tick, whatever it had: `chosenFrom` would drop it
 * anyway, and a ticked box on a row the run will skip is the dialog promising a cobro it
 * cannot create.
 */
export function mergeRows(
  items: MonthlyFeeCandidate[],
  previous: GenerarMesRow[] | null,
): GenerarMesRow[] {
  const kept = new Map((previous ?? []).map((row) => [row.clientId, row]))
  return items.map((item) => {
    const prior = kept.get(item.clientId)
    // Every priced line ticked by default: the contract is what the client agreed to
    // pay, so billing all of it is the expected month and leaving one out is the
    // exception the operator makes deliberately.
    const allLineIds = item.lines === null ? null : item.lines.map((l) => l.id)
    // Every pending production ticked by default too: it was delivered, so billing it is
    // the expected month, and holding one back is the operator's deliberate exception.
    const allProductionIds = item.productions.map((p) => p.id)
    if (!prior || prior.skipReason !== null) {
      return {
        ...item,
        selected: opensTicked(item),
        service: item.suggestedService ?? '',
        selectedLineIds: allLineIds,
        selectedProductionIds: allProductionIds,
      }
    }
    return {
      ...item,
      selected: item.skipReason === null && prior.selected,
      service: prior.service || item.suggestedService || '',
      // Keep what the operator unticked across a re-read, but only for lines that still
      // exist — a line deleted since the preview must not travel into the request.
      selectedLineIds:
        prior.selectedLineIds === null || allLineIds === null
          ? allLineIds
          : prior.selectedLineIds.filter((id) => allLineIds.includes(id)),
      selectedProductionIds: prior.selectedProductionIds.filter((id) => allProductionIds.includes(id)),
    }
  })
}

/**
 * Whether this row would re-bill something the client was already invoiced for by hand.
 *
 * ONE rule, used by the count, the request, the row caption and the alert — the same
 * caption meaning "dropped" on one row and "will be billed" on another is worse than
 * either answer.
 *
 * An EXACT service match, which is precisely what `generateMonthlyFees` refuses — so the
 * count here can never promise a cobro the run will not create, and never withhold one it
 * would. A hand-made cobro for other work is not this row's problem.
 *
 * A client with no contracted services whose GUESSED label differs is deliberately NOT a
 * clash: it gets billed, with a warning, via `mayDuplicateByGuess`. Blocking it there made
 * a client with one unrelated one-off cobro ungeneratable for the whole month.
 */
export function clashesWithManual(row: GenerarMesRow): boolean {
  if (row.manualServices.length === 0) return false
  // For a priced row the cobro carries its LINE names, so ask about those — the summary
  // label a multi-line cobro is filed under would never match a hand-made 'Redes', which
  // is exactly how the same money gets billed twice. Mirrors the server's own set
  // comparison in `generateMonthlyFees`.
  if (hasPricedLines(row)) {
    return selectedLinesOf(row).some((l) => row.manualServices.includes(l.name))
  }
  // A cobro of productions alone carries no retainer, and the server runs no manual-clash
  // check for it: the productions have their own once-only marker.
  if (row.productions.length > 0 && row.monthlyFee === 0) return false
  const wouldBill = row.service || row.suggestedService
  return wouldBill !== null && wouldBill !== '' && row.manualServices.includes(wouldBill)
}

/**
 * Not a clash — this row WILL be created — but worth saying out loud.
 *
 * The client contracts nothing on record, so its service came out of the catalog fallback
 * and the label is a guess. It already carries a hand-made cobro this period under a
 * different label. "Redes" versus "Producción" here says nothing about whether the two are
 * the same money, so the operator is the only one who can tell.
 *
 * Deliberately a WARNING and not an exclusion. Blocking it was worse: a client with one
 * unrelated one-off cobro could then never have its retainer generated at all, and every
 * catalog option it was offered clashed, so the only advice left was "desmarcalo".
 */
export function mayDuplicateByGuess(row: GenerarMesRow): boolean {
  return (
    row.services.length === 0 &&
    row.manualServices.length > 0 &&
    row.service !== '' &&
    !clashesWithManual(row)
  )
}

/**
 * Rows this run will actually bill: picked, billable, attributed to a service, and not
 * already carrying a hand-made cobro for THAT service.
 *
 * The last clause is not a policy choice, it is arithmetic. `generateMonthlyFees`
 * unconditionally skips a same-service clash as `manual_exists`, so counting one here
 * makes the button promise a cobro the run is guaranteed not to create. Reachable by
 * ticking a service-less row through "Seleccionar todo" and then picking the clashing
 * service by hand.
 */
export function chosenFrom(rows: GenerarMesRow[]): GenerarMesRow[] {
  return rows.filter(
    (row) =>
      row.selected &&
      row.skipReason === null &&
      // The LABEL, not `row.service`: a priced row derives its label from the selection
      // and would otherwise be dropped for an empty `service` it can never fill.
      // Empty here means a priced row with nothing ticked, which `emptySelectionFrom`
      // reports by name.
      serviceLabelFor(row) !== '' &&
      !clashesWithManual(row),
  )
}

/**
 * Rows the operator picked but never attributed to a service.
 *
 * They leave the run instead of blocking it. One client nobody can resolve used to disable
 * generation for every other client on screen, which is why a roster of 21 produced a dead
 * button. They are reported rather than dropped: a bulk money action must never quietly
 * bill less than the operator believes it ticked.
 */
export function unresolvedFrom(rows: GenerarMesRow[]): GenerarMesRow[] {
  return rows.filter(
    (row) =>
      row.selected &&
      row.skipReason === null &&
      // The LABEL, not `row.service`. A priced row derives its label from the ticked
      // services and leaves `service` empty, so keying on the raw field announced every
      // priced client as "queda fuera, sin servicio elegido" — while `chosenFrom`
      // included it and the run billed it. The dialog contradicted itself: a warning
      // saying a client would not be billed, over a total that was billing it.
      //
      // A priced row with nothing ticked is NOT reported here: it has its own list
      // (`emptySelectionFrom`), whose message says what to do about it.
      needsServicePick(row) &&
      serviceLabelFor(row) === '',
  )
}

/**
 * The rows the operator can act on at all: not already covered by this period.
 *
 * "Seleccionar todo" ticks exactly this set, the header box measures exactly this set, and
 * these are exactly the enabled checkboxes. Keeping those three identical is the point — an
 * earlier version had select-all skip rows whose service clashes with a hand-made cobro,
 * which put the header out of step with the rows beneath it: with one clashing row left
 * unticked the box still read checked, and clicking it cleared the retainers that WERE
 * selected.
 *
 * Narrowing it again would reopen that, and buys nothing: this is not the double-billing
 * guard — the server is, and it refuses a same-service duplicate whatever the browser sends
 * — and a clashing row cannot inflate the promise either, because `chosenFrom` leaves it
 * out of both the count and the request while the row keeps its caption and its alert.
 */
export function selectableFrom(rows: GenerarMesRow[]): GenerarMesRow[] {
  return rows.filter((row) => row.skipReason === null)
}

/** Whether the run can go ahead. Deliberately NOT gated on `unresolved` being empty. */
export function canGenerate(rows: GenerarMesRow[], dueDate: string): boolean {
  return chosenFrom(rows).length > 0 && dueDate !== ''
}

/**
 * Why the primary action is disabled, or null when it is not.
 *
 * A disabled control with no stated reason is indistinguishable from a broken one, and an
 * empty Vencimiento used to disable this button in total silence.
 */
export function disabledReasonFor(rows: GenerarMesRow[], dueDate: string): string | null {
  if (dueDate === '') return 'Elegí la fecha de vencimiento'
  if (chosenFrom(rows).length > 0) return null
  // Nobody is selectable at all: every row sits behind a disabled checkbox, so telling the
  // operator to pick a client names something that is not on screen. WHY they are all
  // blocked matters — a studio that typed the month's cobros by hand would be told the
  // generator already ran when it never did.
  if (rows.length > 0 && selectableFrom(rows).length === 0) {
    if (rows.every((row) => row.skipReason === 'already_generated')) {
      return 'Ya se generaron los cobros de este mes'
    }
    // Checked before the generic sentence below, because that one would be a lie here:
    // a client waiting on the month's rate does NOT already have its cobro, and the fix
    // is a field in this same dialog rather than anything to do with the roster.
    if (rows.some((row) => row.skipReason === 'missing_exchange_rate')) {
      return 'Cargá la cotización del dólar para generar estos cobros'
    }
    return 'Todos los clientes ya tienen su cobro de este mes'
  }
  // Naming the clash matters more than it looks. Everything the operator was asked for IS
  // filled in, so "elegí un cliente y su servicio" reads as the form being broken, and the
  // only true explanation lives in a row caption that may be scrolled out of view.
  const clashing = rows.filter(
    (row) =>
      row.selected &&
      row.skipReason === null &&
      row.service !== '' &&
      clashesWithManual(row),
  )
  if (clashing.length > 0) {
    // NAMED, always. This message replaces the summary alert on screen, so a plural form
    // saying only "los clientes elegidos" makes the names disappear altogether.
    const named = nameList(clashing.map((row) => row.clientName))
    // "Elegí otro" has to BE possible. A client contracting two services that were both
    // already billed by hand previews as clean — no single service resolves, so the
    // server's `manual_exists` check never runs — and clashes on every option it offers.
    const unsatisfiable = clashing.every((row) =>
      serviceOptionsFor(row).every((service) => clashesWithManual({ ...row, service })),
    )
    if (unsatisfiable) {
      return clashing.length === 1
        ? `${named} ya tiene todos sus servicios cargados a mano, desmarcalo`
        : `Ya tienen todos sus servicios cargados a mano, desmarcalos: ${named}`
    }
    return clashing.length === 1
      ? `${named} ya tiene ese servicio cargado a mano, elegí otro`
      : `Ya tienen ese servicio cargado a mano, elegí otro: ${named}`
  }
  // Selected, but nobody has a service yet. On the un-backfilled roster this is what
  // "Seleccionar todo" produces, and telling the operator to "elegí al menos un cliente"
  // while 21 boxes are ticked is the same dead-button-with-a-wrong-reason this whole
  // change exists to remove.
  if (unresolvedFrom(rows).length > 0) return 'Elegí el servicio de los clientes seleccionados'
  // A PRICED client ticked with none of its services ticked. It needs its own sentence:
  // the one below tells the operator to pick a client and a service while the client IS
  // picked and has no service picker at all — a dead button with advice you cannot act
  // on, which is the exact defect the note above says this function exists to remove.
  if (emptySelectionFrom(rows).length > 0) {
    const names = nameList(emptySelectionFrom(rows).map((row) => row.clientName))
    return emptySelectionFrom(rows).length === 1
      ? `Tildá al menos un servicio de ${names}, o desmarcá el cliente`
      : `Tildá al menos un servicio, o desmarcá los clientes: ${names}`
  }
  return 'Elegí al menos un cliente y su servicio'
}
