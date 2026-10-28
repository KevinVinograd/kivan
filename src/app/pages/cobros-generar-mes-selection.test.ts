import { describe, expect, it } from 'vitest'

import { SERVICE_CATALOG } from './clients-mock-data'
import {
  canGenerate,
  chosenFrom,
  clashesWithManual,
  disabledReasonFor,
  mayDuplicateByGuess,
  billedAmount,
  emptySelectionFrom,
  hasPricedLines,
  mergeRows,
  serviceLabelFor,
  opensTicked,
  selectableFrom,
  serviceOptionsFor,
  unresolvedFrom,
  type GenerarMesRow,
} from './cobros-generar-mes-selection'
import type { MonthlyFeeCandidate } from './receivables-api-data'
import { SKIP_LABEL } from './cobros-generar-mes-row'

const DUE = '2026-09-10'

function row(over: Partial<GenerarMesRow> = {}): GenerarMesRow {
  return {
    clientId: 'cli-1',
    clientName: 'Cliente Uno',
    services: ['Redes'],
    suggestedService: 'Redes',
    monthlyFee: 120_000,
    currency: 'ARS',
    convertedArs: null,
    discountPercent: null,
    discountAmount: null,
    lines: null,
    selectedLineIds: null,
    productions: [],
    selectedProductionIds: [],
    arsPerUsd: null,
    skipReason: null,
    manualServices: [],
    selected: true,
    service: 'Redes',
    ...over,
  }
}

describe('serviceOptionsFor', () => {
  it('offers the catalog to a client whose contracted services were never loaded', () => {
    // Migration 0011 added `Client.services` with no backfill, so this is the COMMON row,
    // not an edge case. Sourcing the picker straight off the empty array is what made an
    // eligible client impossible to bill.
    const options = serviceOptionsFor(row({ services: [], suggestedService: null, service: '' }))
    expect(options.length).toBeGreaterThan(0)
    expect(options).toEqual([...SERVICE_CATALOG])
  })

  it('offers only what the client actually contracts when that is on record', () => {
    expect(serviceOptionsFor(row({ services: ['Redes', 'Ads'] }))).toEqual(['Redes', 'Ads'])
  })
})

describe('the batch veto', () => {
  it('bills the resolved clients even when another one has no service picked', () => {
    // The whole point. Before this, one unresolvable client disabled generation for every
    // other client on screen: a roster of 21 produced "Generar 0 cobros", permanently.
    const rows = [
      row({ clientId: 'ok-1' }),
      row({ clientId: 'ok-2' }),
      row({ clientId: 'stuck', services: [], suggestedService: null, service: '' }),
    ]

    expect(canGenerate(rows, DUE)).toBe(true)
    expect(chosenFrom(rows).map((r) => r.clientId)).toEqual(['ok-1', 'ok-2'])
    expect(disabledReasonFor(rows, DUE)).toBeNull()
  })

  it('reports the client it is leaving out rather than dropping it silently', () => {
    const rows = [row({ clientId: 'ok' }), row({ clientId: 'stuck', service: '' })]
    expect(unresolvedFrom(rows).map((r) => r.clientId)).toEqual(['stuck'])
  })

  it('never counts an unresolved row as billed', () => {
    const rows = [row({ service: '' })]
    expect(chosenFrom(rows)).toHaveLength(0)
    expect(canGenerate(rows, DUE)).toBe(false)
  })

  it('leaves a blocked row out even when it is somehow marked selected', () => {
    // `skipReason` means the period is already covered. Sending it would have the server
    // skip it anyway, so it must never reach the request.
    const rows = [row({ skipReason: 'already_generated', selected: true })]
    expect(chosenFrom(rows)).toHaveLength(0)
  })
})

describe('a client already billed by hand', () => {
  it('is still billable when the operator explicitly picks it', () => {
    // Not a block: a second cobro under a genuinely different service is legitimate. The
    // protection is that it is never PRE-ticked (asserted in the dialog), not that it is
    // refused here.
    const rows = [row({ manualServices: ['Redes'], service: 'Ads', selected: true })]
    expect(chosenFrom(rows)).toHaveLength(1)
    expect(canGenerate(rows, DUE)).toBe(true)
  })
})

describe('disabledReasonFor', () => {
  it('names the empty vencimiento, which used to disable the button in silence', () => {
    expect(disabledReasonFor([row()], '')).toBe('Elegí la fecha de vencimiento')
    expect(canGenerate([row()], '')).toBe(false)
  })

  it('names an empty selection', () => {
    expect(disabledReasonFor([row({ selected: false })], DUE)).toBe(
      'Elegí al menos un cliente y su servicio',
    )
  })

  it('says nothing once the run is valid', () => {
    expect(disabledReasonFor([row()], DUE)).toBeNull()
  })
})

describe('selectableFrom', () => {
  it('is exactly the enabled checkboxes, so the header cannot disagree with the rows', () => {
    // It used to also exclude a clashing row. That left the header reading checked while an
    // enabled row sat unticked, and clicking it cleared the retainers that WERE selected.
    const rows = [
      row({ clientId: 'plain', service: 'Redes', manualServices: [] }),
      row({ clientId: 'clash', service: 'Redes', manualServices: ['Redes'] }),
      row({ clientId: 'unresolved', suggestedService: null, service: '' }),
      row({ clientId: 'covered', skipReason: 'already_generated' }),
    ]
    expect(selectableFrom(rows).map((r) => r.clientId)).toEqual(['plain', 'clash', 'unresolved'])
  })

  it('leaves the clash to chosenFrom, which keeps it out of the count and the request', () => {
    const clash = row({ service: 'Redes', manualServices: ['Redes'], selected: true })
    expect(selectableFrom([clash])).toHaveLength(1)
    expect(chosenFrom([clash])).toHaveLength(0)
  })
})

describe('a same-service clash', () => {
  it('is not counted, because the run is guaranteed to skip it', () => {
    // The server skips `manual_exists` unconditionally, so counting this row would have
    // the button promise a cobro that cannot be created. Reachable via select-all on a
    // service-less row followed by picking the clashing service by hand.
    const rows = [row({ service: 'Redes', manualServices: ['Redes'], selected: true })]
    expect(chosenFrom(rows)).toHaveLength(0)
    expect(canGenerate(rows, DUE)).toBe(false)
  })

  it('still counts a DIFFERENT service for the same client', () => {
    const rows = [row({ service: 'Ads', manualServices: ['Redes'], selected: true })]
    expect(chosenFrom(rows)).toHaveLength(1)
  })
})

describe('the clash is named, not hidden behind a generic reason', () => {
  it('says which client already has that service, instead of "elegí un cliente"', () => {
    // Everything asked for IS filled in, so the generic line reads as the form being
    // broken and points the operator at nothing they can act on. This client contracts two
    // services with only one taken, so switching is genuinely available.
    const rows = [
      row({
        clientName: 'Núcleo',
        services: ['Redes', 'Ads'],
        suggestedService: null,
        service: 'Redes',
        manualServices: ['Redes'],
      }),
    ]
    expect(disabledReasonFor(rows, DUE)).toBe(
      'Núcleo ya tiene ese servicio cargado a mano, elegí otro',
    )
  })

  it('keeps the generic line when nothing is picked at all', () => {
    expect(disabledReasonFor([row({ selected: false })], DUE)).toBe(
      'Elegí al menos un cliente y su servicio',
    )
  })
})

describe('a selection with no services picked at all', () => {
  it('says to pick the services, not to pick a client', () => {
    // What "Seleccionar todo" produces on the un-backfilled roster. Telling the operator
    // to choose a client while 21 boxes are ticked is the dead-button-with-a-wrong-reason
    // this whole change exists to remove.
    const rows = [
      row({ clientId: 'a', suggestedService: null, service: '', selected: true }),
      row({ clientId: 'b', suggestedService: null, service: '', selected: true }),
    ]
    expect(canGenerate(rows, DUE)).toBe(false)
    expect(disabledReasonFor(rows, DUE)).toBe('Elegí el servicio de los clientes seleccionados')
  })
})

describe('opensTicked', () => {
  it('ticks a client whose retainer resolves to one contracted service', () => {
    expect(opensTicked(row({ suggestedService: 'Redes' }))).toBe(true)
  })

  it('does NOT tick a client whose service would be a catalog guess', () => {
    // The protection this dialog leans on. Reverting it to a bare `skipReason === null`
    // arms a 21-client bulk bill under services nobody chose, and before this test that
    // revert left the whole suite green.
    expect(opensTicked(row({ services: [], suggestedService: null }))).toBe(false)
  })

  it('does NOT tick a client whose period is already covered', () => {
    expect(opensTicked(row({ skipReason: 'already_generated' }))).toBe(false)
  })
})

describe('a month that is already generated', () => {
  it('says so, instead of asking for a client that is not selectable', () => {
    // Reopening the dialog puts every row behind a disabled checkbox, and the header
    // select-all does not render — so "elegí al menos un cliente" names nothing on screen.
    const rows = [
      row({ clientId: 'a', skipReason: 'already_generated', selected: false }),
      row({ clientId: 'b', skipReason: 'already_generated', selected: false }),
    ]
    expect(canGenerate(rows, DUE)).toBe(false)
    expect(disabledReasonFor(rows, DUE)).toBe('Ya se generaron los cobros de este mes')
  })

  it('keeps the generic line while at least one client is still selectable', () => {
    const rows = [
      row({ clientId: 'a', skipReason: 'already_generated' }),
      row({ clientId: 'b', selected: false }),
    ]
    expect(disabledReasonFor(rows, DUE)).toBe('Elegí al menos un cliente y su servicio')
  })
})

describe('a roster where nothing is selectable', () => {
  it('does not claim the generator ran when the studio typed the cobros by hand', () => {
    // All rows blocked, but by `manual_exists` — the month was never generated. Saying it
    // was is the same wrong-reason failure the generic line had.
    const rows = [
      row({ clientId: 'a', skipReason: 'manual_exists', selected: false }),
      row({ clientId: 'b', skipReason: 'manual_exists', selected: false }),
    ]
    expect(disabledReasonFor(rows, DUE)).toBe('Todos los clientes ya tienen su cobro de este mes')
  })

  it('says the generator ran when it actually did', () => {
    const rows = [row({ skipReason: 'already_generated', selected: false })]
    expect(disabledReasonFor(rows, DUE)).toBe('Ya se generaron los cobros de este mes')
  })
})

describe('an unsatisfiable clash', () => {
  it('says to untick, not to pick a service that does not exist', () => {
    // Two contracted services, both already billed by hand. Nothing resolves, so the server
    // never marks it `manual_exists`, the row is tickable, and every option the Select
    // offers clashes. "Elegí otro" would be an instruction nothing can satisfy.
    const rows = [
      row({
        clientName: 'Dos Servicios',
        services: ['Redes', 'Ads'],
        suggestedService: null,
        service: 'Redes',
        manualServices: ['Redes', 'Ads'],
      }),
    ]
    expect(disabledReasonFor(rows, DUE)).toBe(
      'Dos Servicios ya tiene todos sus servicios cargados a mano, desmarcalo',
    )
  })

  it('still says to pick another when one is genuinely free', () => {
    const rows = [
      row({
        clientName: 'Dos Servicios',
        services: ['Redes', 'Ads'],
        suggestedService: null,
        service: 'Redes',
        manualServices: ['Redes'],
      }),
    ]
    expect(disabledReasonFor(rows, DUE)).toBe(
      'Dos Servicios ya tiene ese servicio cargado a mano, elegí otro',
    )
  })
})

describe('clashesWithManual', () => {
  it('needs an exact match when the client has real contracted services', () => {
    const base: Partial<GenerarMesRow> = { services: ['Redes', 'Ads'], suggestedService: null }
    expect(clashesWithManual(row({ ...base, service: 'Redes', manualServices: ['Redes'] }))).toBe(true)
    expect(clashesWithManual(row({ ...base, service: 'Ads', manualServices: ['Redes'] }))).toBe(false)
  })

  it('warns but does not block when the service is a catalog guess', () => {
    // No contracted services on record, so "Producción" is a label this dialog invented.
    // Calling it a different service from the hand-made "Redes" bills the same retainer
    // twice — and the caption, the count and the request all have to agree on that.
    const guessed = row({
      services: [],
      suggestedService: null,
      service: 'Producción',
      manualServices: ['Redes'],
      selected: true,
    })
    // WARNED, not blocked: blocking it meant a client with one unrelated one-off cobro
    // could never have its retainer generated at all.
    expect(clashesWithManual(guessed)).toBe(false)
    expect(mayDuplicateByGuess(guessed)).toBe(true)
    expect(chosenFrom([guessed])).toHaveLength(1)
  })

  it('is silent when nothing was billed by hand', () => {
    expect(clashesWithManual(row({ services: [], manualServices: [] }))).toBe(false)
  })
})


describe('missing_exchange_rate', () => {
  it('sends the operator to the rate, not to the roster, when it is what blocks the run', () => {
    // Every row blocked, and none of them because a cobro already exists. The generic
    // "todos los clientes ya tienen su cobro de este mes" would be a plain lie here, and
    // it points at the roster when the fix is a field in this same dialog.
    const rows = [
      row({ clientId: 'a', clientName: 'Emblema', currency: 'USD', skipReason: 'missing_exchange_rate' }),
      row({ clientId: 'b', clientName: 'Pesos SA', skipReason: 'already_generated' }),
    ]
    expect(selectableFrom(rows)).toHaveLength(0)
    expect(disabledReasonFor(rows, DUE)).toBe('Cargá la cotización del dólar para generar estos cobros')
  })

  it('keeps saying "ya se generaron" when that is the whole story', () => {
    const rows = [row({ skipReason: 'already_generated' })]
    expect(disabledReasonFor(rows, DUE)).toBe('Ya se generaron los cobros de este mes')
  })

  it('does not block the peso clients while a dollar one waits for the rate', () => {
    // The dollar row is out, the peso row is billable, and the button works. Blocking the
    // whole run on one unpriced client is the failure mode this ordering exists to avoid.
    const rows = [
      row({ clientId: 'a', currency: 'USD', skipReason: 'missing_exchange_rate' }),
      row({ clientId: 'b' }),
    ]
    expect(chosenFrom(rows)).toHaveLength(1)
    expect(disabledReasonFor(rows, DUE)).toBeNull()
  })
})

describe('mergeRows', () => {
  const candidate = (over: Partial<MonthlyFeeCandidate> = {}): MonthlyFeeCandidate => {
    const { selected: _s, service: _v, ...rest } = row()
    return { ...rest, ...over }
  }

  it('keeps the ticks and services the operator already chose', () => {
    // The dialog re-reads the preview after the rate is saved. Losing the selection would
    // punish the operator for the one action that unblocked the roster.
    const previous = [
      row({ clientId: 'a', selected: false, service: 'Ads' }),
      row({ clientId: 'b', selected: true, service: 'Redes' }),
    ]
    const merged = mergeRows([candidate({ clientId: 'a' }), candidate({ clientId: 'b' })], previous)
    expect(merged.find((r) => r.clientId === 'a')).toMatchObject({ selected: false, service: 'Ads' })
    expect(merged.find((r) => r.clientId === 'b')).toMatchObject({ selected: true, service: 'Redes' })
  })

  it('opens a row the rate just unblocked, instead of carrying a disabled checkbox forward', () => {
    // Its `selected: false` was never a choice: the box was disabled. This is exactly the
    // dollar client the rate was loaded FOR, so carrying that false through would leave the
    // roster looking untouched after the one action taken to change it.
    const previous = [
      row({ clientId: 'a', currency: 'USD', skipReason: 'missing_exchange_rate', selected: false }),
    ]
    const merged = mergeRows(
      [candidate({ clientId: 'a', currency: 'USD', skipReason: null, suggestedService: 'Redes', convertedArs: 617_250 })],
      previous,
    )
    expect(merged[0]).toMatchObject({ selected: true, service: 'Redes', convertedArs: 617_250 })
  })

  it('unticks a row that became blocked, whatever it carried', () => {
    // `chosenFrom` would drop it anyway. A ticked box on a row the run will skip is the
    // dialog promising a cobro it cannot create.
    const previous = [row({ clientId: 'a', selected: true, service: 'Redes' })]
    const merged = mergeRows([candidate({ clientId: 'a', skipReason: 'already_generated' })], previous)
    expect(merged[0]?.selected).toBe(false)
  })

  it('treats a first load as fresh, applying the opensTicked rule', () => {
    const merged = mergeRows(
      [
        candidate({ clientId: 'a', suggestedService: 'Redes' }),
        // No service resolves, so it must NOT open ticked: the catalog fallback is a guess
        // and a bulk money action does not make it silently.
        candidate({ clientId: 'b', suggestedService: null, services: [] }),
      ],
      null,
    )
    expect(merged.find((r) => r.clientId === 'a')).toMatchObject({ selected: true, service: 'Redes' })
    expect(merged.find((r) => r.clientId === 'b')).toMatchObject({ selected: false, service: '' })
  })

  it('takes the SERVER amounts, never the ones on screen', () => {
    // The point of re-reading. A merge that kept the old figures would show the operator a
    // pre-rate roster while the generator billed a converted one.
    const previous = [row({ clientId: 'a', currency: 'USD', monthlyFee: 500, convertedArs: null })]
    const merged = mergeRows(
      [candidate({ clientId: 'a', currency: 'USD', monthlyFee: 500, convertedArs: 617_250 })],
      previous,
    )
    expect(merged[0]?.convertedArs).toBe(617_250)
  })

  it('drops a client that left the roster between reads', () => {
    const merged = mergeRows([candidate({ clientId: 'a' })], [row({ clientId: 'a' }), row({ clientId: 'gone' })])
    expect(merged.map((r) => r.clientId)).toEqual(['a'])
  })
})


/**
 * A client the run leaves out because the month has no rate is OWED a cobro and is not
 * getting one, which makes it a different kind of skip from the rest.
 *
 * `already_generated` and `manual_exists` mean the client is already handled. This one
 * means it is not. The rows never reach the request (`chosenFrom` drops anything blocked),
 * so the server has nothing to report as skipped and answers with an empty list — leaving
 * the browser as the ONLY place that knows. These pin the rule the dialog builds both its
 * on-screen alert and its completion toast from.
 */
describe('clients left out for want of a rate', () => {
  const awaitingRateIn = (rows: GenerarMesRow[]) =>
    rows.filter((r) => r.skipReason === 'missing_exchange_rate')

  it('is not one of the "already handled" reasons', () => {
    // The distinction the toast and the alert are built on. If this ever collapses into
    // `covered`, four unbilled retainers stop being counted as missing.
    const rows = [
      row({ clientId: 'usd', skipReason: 'missing_exchange_rate' }),
      row({ clientId: 'done', skipReason: 'already_generated' }),
      row({ clientId: 'hand', skipReason: 'manual_exists' }),
    ]
    expect(awaitingRateIn(rows).map((r) => r.clientId)).toEqual(['usd'])
  })

  it('is invisible to the server, so the browser is the only place that can name it', () => {
    // The whole reason it needs its own announcement: it is filtered out client-side and
    // never reaches the request, so `result.skipped` comes back empty and a run of 20 peso
    // clients reports itself as completely clean.
    const rows = [
      row({ clientId: 'a' }),
      row({ clientId: 'usd', currency: 'USD', skipReason: 'missing_exchange_rate' }),
    ]
    expect(chosenFrom(rows).map((r) => r.clientId)).toEqual(['a'])
    expect(awaitingRateIn(rows)).toHaveLength(1)
  })

  it('has a label of its own, so it is never reported as a uuid or as another reason', () => {
    // The toast reads `SKIP_LABEL[reason]`. A missing entry renders the raw key.
    expect(SKIP_LABEL.missing_exchange_rate).toBe('Falta la cotización')
    expect(new Set(Object.values(SKIP_LABEL)).size).toBe(Object.keys(SKIP_LABEL).length)
  })
})

/**
 * What the operator approves has to be what the run writes.
 *
 * The dialog used to subtract `discountAmount` - the server's answer for the WHOLE
 * retainer - from whatever base was on the row. Correct while a row was always the whole
 * retainer; a guaranteed approve-one/bill-another the moment a service can be left out
 * for the month.
 */
describe('billedAmount', () => {
  const priced = (over: Partial<GenerarMesRow> = {}): GenerarMesRow =>
    row({
      monthlyFee: 100_000,
      lines: [
        { id: 'l-redes', name: 'Redes', price: 60_000 },
        { id: 'l-ads', name: 'Ads', price: 40_000 },
      ],
      selectedLineIds: ['l-redes', 'l-ads'],
      ...over,
    })

  it('bills the whole retainer when every service is ticked', () => {
    expect(billedAmount(priced())).toEqual({ amount: 100_000, currency: 'ARS' })
  })

  it('bills only the ticked services', () => {
    // "agregar o deducir servicios brindados o no para un mes en particular".
    expect(billedAmount(priced({ selectedLineIds: ['l-redes'] })).amount).toBe(60_000)
  })

  it('recomputes the discount against the SUBSET, not the whole fee', () => {
    // The regression. With Ads unticked the base is 60.000, so 10% off is 6.000 and the
    // cobro is 54.000. Subtracting the whole-fee discount of 10.000 would show 50.000 on
    // screen while the server wrote 54.000 - the operator approving one number and the
    // run creating another.
    const row_ = priced({
      selectedLineIds: ['l-redes'],
      discountPercent: 10,
      discountAmount: 10_000,
    })
    expect(billedAmount(row_).amount).toBe(54_000)
  })

  it('applies the discount to the full fee when nothing is unticked', () => {
    const row_ = priced({ discountPercent: 10, discountAmount: 10_000 })
    expect(billedAmount(row_).amount).toBe(90_000)
  })

  it('floors the DISCOUNT in centavos, like the server does', () => {
    // 10.033 pesos = 1003300 centavos; 12,5% of that is 125412,5 -> floored to 125412,
    // so the net is 877888 centavos = 8778,88. Flooring the NET in pesos would give 8778
    // and disagree with the cobro by 88 centavos.
    const row_ = row({
      monthlyFee: 10_033,
      discountPercent: 12.5,
      discountAmount: 1254.12,
      lines: null,
      selectedLineIds: null,
    })
    expect(billedAmount(row_).amount).toBeCloseTo(8778.88, 2)
  })

  it('keeps a client with no priced services on its whole retainer', () => {
    // Most of the book. `lines: null` is an API that predates pricing; `[]` is a client
    // nobody has priced. Both bill the hand-typed fee, exactly as before.
    expect(billedAmount(row({ monthlyFee: 75_000 })).amount).toBe(75_000)
    expect(
      billedAmount(row({ monthlyFee: 75_000, lines: [], selectedLineIds: [] })).amount,
    ).toBe(75_000)
  })

  it('scales a converted retainer by the share being billed', () => {
    // A dollar client: the pesos the server arrived at for the whole retainer, taken down
    // to the ticked share. Billing the full converted figure for a subset would overbill
    // by whatever was left out.
    const row_ = priced({ currency: 'USD', convertedArs: 1_000_000, selectedLineIds: ['l-ads'] })
    expect(billedAmount(row_)).toEqual({ amount: 400_000, currency: 'ARS' })
  })

  it('never goes below zero', () => {
    expect(billedAmount(priced({ discountPercent: 100 })).amount).toBe(0)
  })
})

describe('hasPricedLines', () => {
  it('separates an API that predates pricing from a client nobody priced', () => {
    // The dialog keys on this to decide whether to offer the per-service checklist at
    // all. Getting it wrong means sending line ids to a server that strips them, which
    // bills the full retainer while the screen shows a subset.
    expect(hasPricedLines(row({ lines: null }))).toBe(false)
    expect(hasPricedLines(row({ lines: [] }))).toBe(false)
    expect(hasPricedLines(row({ lines: [{ id: 'l', name: 'Redes', price: 1 }] }))).toBe(true)
  })
})

describe('opensTicked with priced services', () => {
  it('opens a multi-service PRICED client ticked', () => {
    // The old rule required exactly one contracted service, and a priced client usually
    // has several - so the clients the operator had just finished pricing would be the
    // ones opening unticked and getting dropped from the run.
    const candidate = {
      ...row({
        suggestedService: null,
        lines: [
          { id: 'a', name: 'Redes', price: 1 },
          { id: 'b', name: 'Ads', price: 1 },
        ],
      }),
    }
    expect(opensTicked(candidate)).toBe(true)
  })

  it('still refuses to guess for an UNPRICED client with several services', () => {
    expect(opensTicked(row({ suggestedService: null, lines: [] }))).toBe(false)
  })
})

/**
 * A priced client has to be BILLABLE, whatever its free-text service labels say.
 *
 * `suggestedService` is null unless `Client.services` holds exactly one label - and a
 * priced client usually contracts several. That left the row with `service: ''`, ticked
 * by the new rule, dropped by `chosenFrom` for the empty service, and with no picker to
 * fix it (the Select is hidden once a row is priced). Ticked, unbillable, no control on
 * screen: the dead Generar button this module exists to prevent.
 */
describe('serviceLabelFor', () => {
  const priced = (over: Partial<GenerarMesRow> = {}): GenerarMesRow =>
    row({
      suggestedService: null,
      service: '',
      lines: [
        { id: 'l-redes', name: 'Redes', price: 60_000 },
        { id: 'l-ads', name: 'Ads', price: 40_000 },
      ],
      selectedLineIds: ['l-redes', 'l-ads'],
      ...over,
    })

  it('labels a multi-service month, so the row can be billed at all', () => {
    expect(serviceLabelFor(priced())).toBe('Abono mensual')
  })

  it('bills a single ticked service under ITS OWN name', () => {
    // Not cosmetic: it is what lets the duplicate guard match a hand-made cobro for the
    // same service, on both sides of the wire.
    expect(serviceLabelFor(priced({ selectedLineIds: ['l-ads'] }))).toBe('Ads')
  })

  it('is empty when nothing is ticked', () => {
    expect(serviceLabelFor(priced({ selectedLineIds: [] }))).toBe('')
  })

  it('leaves an UNPRICED row on its own service', () => {
    expect(serviceLabelFor(row({ service: 'Redes' }))).toBe('Redes')
  })

  it('reaches the request instead of being silently dropped', () => {
    // The regression, end to end: this row used to be filtered out by chosenFrom.
    expect(chosenFrom([priced()])).toHaveLength(1)
  })
})

describe('unresolvedFrom with priced services', () => {
  it('does NOT call a billable priced row unresolved', () => {
    // Caught by driving the real app, not by a unit test: the dialog announced
    // "Queda fuera, sin servicio elegido" and "1 cliente queda fuera" over a total
    // that was billing that exact client. `unresolvedFrom` keyed on `row.service`,
    // which a priced row leaves empty because its label is derived from the ticks.
    const priced = row({
      selected: true,
      suggestedService: null,
      service: '',
      lines: [{ id: 'l', name: 'Redes', price: 60_000 }],
      selectedLineIds: ['l'],
    })
    expect(unresolvedFrom([priced])).toHaveLength(0)
    expect(chosenFrom([priced])).toHaveLength(1)
  })

  it('leaves an emptied priced row to its OWN list, not this one', () => {
    // Both messages would otherwise fire on one row, giving two different reasons for
    // the same exclusion.
    const emptied = row({
      selected: true,
      service: '',
      lines: [{ id: 'l', name: 'Redes', price: 60_000 }],
      selectedLineIds: [],
    })
    expect(unresolvedFrom([emptied])).toHaveLength(0)
    expect(emptySelectionFrom([emptied])).toHaveLength(1)
  })

  it('still reports an UNPRICED row with no service picked', () => {
    // The case the list was written for has to keep working.
    expect(unresolvedFrom([row({ selected: true, service: '' })])).toHaveLength(1)
  })
})

describe('disabledReasonFor an emptied priced row', () => {
  const emptied = (over: Partial<GenerarMesRow> = {}) =>
    row({
      selected: true,
      suggestedService: null,
      service: '',
      lines: [{ id: 'l', name: 'Redes', price: 60_000 }],
      selectedLineIds: [],
      ...over,
    })

  it('names the client and says what to do, instead of asking for a service it cannot pick', () => {
    // The generic fallback tells the operator to "elegí al menos un cliente y su
    // servicio" — while the client IS ticked and a priced row renders no service
    // picker at all. A dead button with advice you cannot act on is the exact defect
    // `disabledReasonFor` exists to remove, so narrowing `unresolvedFrom` to unpriced
    // rows had to come with its own branch here.
    const reason = disabledReasonFor([emptied()], DUE)
    expect(reason).toContain('Cliente Uno')
    expect(reason).not.toBe('Elegí al menos un cliente y su servicio')
  })

  it('names them all when several are emptied', () => {
    const reason = disabledReasonFor(
      [emptied(), emptied({ clientId: 'b', clientName: 'Bar Sur' })],
      DUE,
    )
    expect(reason).toContain('Cliente Uno')
    expect(reason).toContain('Bar Sur')
  })
})

describe('emptySelectionFrom', () => {
  it('names a ticked row the operator emptied', () => {
    // It falls into neither of the other two lists - `unresolvedFrom` keys on an empty
    // `service`, which a priced row never has - so without this it left the run with its
    // checkbox still ticked and nothing anywhere saying the client was not billed.
    const emptied = row({
      selected: true,
      lines: [{ id: 'l', name: 'Redes', price: 1 }],
      selectedLineIds: [],
    })
    expect(emptySelectionFrom([emptied])).toHaveLength(1)
    expect(chosenFrom([emptied])).toHaveLength(0)
  })

  it('ignores a row that still has a service ticked', () => {
    const kept = row({
      selected: true,
      lines: [{ id: 'l', name: 'Redes', price: 1 }],
      selectedLineIds: ['l'],
    })
    expect(emptySelectionFrom([kept])).toHaveLength(0)
  })

  it('ignores an unpriced row, which unresolvedFrom already covers', () => {
    expect(emptySelectionFrom([row({ selected: true, service: '' })])).toHaveLength(0)
  })
})

describe('productions on the month cobro', () => {
  const productions = [
    { id: 'p1', date: '2026-09-05', title: 'Reel A', serviceName: 'Producción con Camara', amount: 110_000 },
    { id: 'p2', date: '2026-09-12', title: 'Reel B', serviceName: 'Producción con Celular', amount: 75_000 },
  ]
  const priced = (over: Partial<GenerarMesRow> = {}) =>
    row({
      suggestedService: null,
      services: [],
      service: '',
      monthlyFee: 100_000,
      lines: [{ id: 'l-redes', name: 'Redes', price: 100_000 }],
      selectedLineIds: ['l-redes'],
      productions,
      selectedProductionIds: ['p1', 'p2'],
      ...over,
    })
  // A client priced by productions alone: no retainer, no lines.
  const onlyProductions = (over: Partial<GenerarMesRow> = {}) =>
    priced({ monthlyFee: 0, lines: [], selectedLineIds: [], ...over })

  it('adds the ticked productions to the amount, discounted like the rest', () => {
    expect(billedAmount(priced()).amount).toBe(285_000)
    expect(billedAmount(priced({ selectedProductionIds: ['p2'] })).amount).toBe(175_000)
    // 10% of 285.000, floored in minor units like the server.
    expect(billedAmount(priced({ discountPercent: 10 })).amount).toBe(256_500)
  })

  it('prices a dollar client with no retainer at the month rate', () => {
    const usd = onlyProductions({ currency: 'USD', convertedArs: 0, arsPerUsd: 1_000 })
    expect(billedAmount(usd)).toEqual({ amount: 185_000_000, currency: 'ARS' })
  })

  it('files a productions-only cobro under their service, or a summary for several', () => {
    expect(serviceLabelFor(onlyProductions({ selectedProductionIds: ['p1'] }))).toBe('Producción con Camara')
    expect(serviceLabelFor(onlyProductions())).toBe('Producciones')
    expect(serviceLabelFor(onlyProductions({ selectedProductionIds: [] }))).toBe('')
  })

  it('keeps the retainer lines as the label when they are ticked', () => {
    expect(serviceLabelFor(priced())).toBe('Redes')
  })

  it('opens ticked, needs no service pick, and is reported when emptied', () => {
    const { selected: _s, service: _v, selectedLineIds: _l, selectedProductionIds: _p, ...candidate } =
      onlyProductions()
    expect(opensTicked(candidate)).toBe(true)
    expect(unresolvedFrom([onlyProductions()])).toHaveLength(0)
    expect(chosenFrom([onlyProductions()])).toHaveLength(1)
    expect(emptySelectionFrom([onlyProductions({ selectedProductionIds: [] })])).toHaveLength(1)
  })

  it('still asks for a label when a hand-typed retainer travels with productions', () => {
    const manual = priced({ lines: [], selectedLineIds: [], monthlyFee: 50_000 })
    expect(unresolvedFrom([manual])).toHaveLength(1)
    expect(serviceLabelFor({ ...manual, service: 'Redes' })).toBe('Redes')
    // Holding every production back still bills the retainer: not an emptied row.
    expect(emptySelectionFrom([{ ...manual, service: 'Redes', selectedProductionIds: [] }])).toHaveLength(0)
  })

  it('does not treat a hand-made cobro as a clash for a productions-only row', () => {
    expect(clashesWithManual(onlyProductions({ manualServices: ['Producción con Camara'] }))).toBe(false)
  })

  it('ticks every production on a fresh read and keeps what the operator held back', () => {
    const { selected: _s, service: _v, selectedLineIds: _l, selectedProductionIds: _p, ...candidate } =
      priced()
    expect(mergeRows([candidate], null)[0]!.selectedProductionIds).toEqual(['p1', 'p2'])
    const kept = mergeRows([candidate], [priced({ selectedProductionIds: ['p2', 'gone'] })])
    expect(kept[0]!.selectedProductionIds).toEqual(['p2'])
  })
})
