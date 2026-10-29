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
    const rows = [row({ skipReason: 'already_generated', selected: true })]
    expect(chosenFrom(rows)).toHaveLength(0)
  })
})

describe('a client already billed by hand', () => {
  it('is still billable when the operator explicitly picks it', () => {
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
    expect(opensTicked(row({ services: [], suggestedService: null }))).toBe(false)
  })

  it('does NOT tick a client whose period is already covered', () => {
    expect(opensTicked(row({ skipReason: 'already_generated' }))).toBe(false)
  })
})

describe('a month that is already generated', () => {
  it('says so, instead of asking for a client that is not selectable', () => {
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
    const guessed = row({
      services: [],
      suggestedService: null,
      service: 'Producción',
      manualServices: ['Redes'],
      selected: true,
    })
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
    const previous = [
      row({ clientId: 'a', selected: false, service: 'Ads' }),
      row({ clientId: 'b', selected: true, service: 'Redes' }),
    ]
    const merged = mergeRows([candidate({ clientId: 'a' }), candidate({ clientId: 'b' })], previous)
    expect(merged.find((r) => r.clientId === 'a')).toMatchObject({ selected: false, service: 'Ads' })
    expect(merged.find((r) => r.clientId === 'b')).toMatchObject({ selected: true, service: 'Redes' })
  })

  it('opens a row the rate just unblocked, instead of carrying a disabled checkbox forward', () => {
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
    const previous = [row({ clientId: 'a', selected: true, service: 'Redes' })]
    const merged = mergeRows([candidate({ clientId: 'a', skipReason: 'already_generated' })], previous)
    expect(merged[0]?.selected).toBe(false)
  })

  it('treats a first load as fresh, applying the opensTicked rule', () => {
    const merged = mergeRows(
      [
        candidate({ clientId: 'a', suggestedService: 'Redes' }),
        candidate({ clientId: 'b', suggestedService: null, services: [] }),
      ],
      null,
    )
    expect(merged.find((r) => r.clientId === 'a')).toMatchObject({ selected: true, service: 'Redes' })
    expect(merged.find((r) => r.clientId === 'b')).toMatchObject({ selected: false, service: '' })
  })

  it('takes the SERVER amounts, never the ones on screen', () => {
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


describe('clients left out for want of a rate', () => {
  const awaitingRateIn = (rows: GenerarMesRow[]) =>
    rows.filter((r) => r.skipReason === 'missing_exchange_rate')

  it('is not one of the "already handled" reasons', () => {
    const rows = [
      row({ clientId: 'usd', skipReason: 'missing_exchange_rate' }),
      row({ clientId: 'done', skipReason: 'already_generated' }),
      row({ clientId: 'hand', skipReason: 'manual_exists' }),
    ]
    expect(awaitingRateIn(rows).map((r) => r.clientId)).toEqual(['usd'])
  })

  it('is invisible to the server, so the browser is the only place that can name it', () => {
    const rows = [
      row({ clientId: 'a' }),
      row({ clientId: 'usd', currency: 'USD', skipReason: 'missing_exchange_rate' }),
    ]
    expect(chosenFrom(rows).map((r) => r.clientId)).toEqual(['a'])
    expect(awaitingRateIn(rows)).toHaveLength(1)
  })

  it('has a label of its own, so it is never reported as a uuid or as another reason', () => {
    expect(SKIP_LABEL.missing_exchange_rate).toBe('Falta la cotización')
    expect(new Set(Object.values(SKIP_LABEL)).size).toBe(Object.keys(SKIP_LABEL).length)
  })
})

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
    expect(billedAmount(priced({ selectedLineIds: ['l-redes'] })).amount).toBe(60_000)
  })

  it('recomputes the discount against the SUBSET, not the whole fee', () => {
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
    expect(billedAmount(row({ monthlyFee: 75_000 })).amount).toBe(75_000)
    expect(
      billedAmount(row({ monthlyFee: 75_000, lines: [], selectedLineIds: [] })).amount,
    ).toBe(75_000)
  })

  it('scales a converted retainer by the share being billed', () => {
    const row_ = priced({ currency: 'USD', convertedArs: 1_000_000, selectedLineIds: ['l-ads'] })
    expect(billedAmount(row_)).toEqual({ amount: 400_000, currency: 'ARS' })
  })

  it('never goes below zero', () => {
    expect(billedAmount(priced({ discountPercent: 100 })).amount).toBe(0)
  })
})

describe('hasPricedLines', () => {
  it('separates an API that predates pricing from a client nobody priced', () => {
    expect(hasPricedLines(row({ lines: null }))).toBe(false)
    expect(hasPricedLines(row({ lines: [] }))).toBe(false)
    expect(hasPricedLines(row({ lines: [{ id: 'l', name: 'Redes', price: 1 }] }))).toBe(true)
  })
})

describe('opensTicked with priced services', () => {
  it('opens a multi-service PRICED client ticked', () => {
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
    expect(serviceLabelFor(priced({ selectedLineIds: ['l-ads'] }))).toBe('Ads')
  })

  it('is empty when nothing is ticked', () => {
    expect(serviceLabelFor(priced({ selectedLineIds: [] }))).toBe('')
  })

  it('leaves an UNPRICED row on its own service', () => {
    expect(serviceLabelFor(row({ service: 'Redes' }))).toBe('Redes')
  })

  it('reaches the request instead of being silently dropped', () => {
    expect(chosenFrom([priced()])).toHaveLength(1)
  })
})

describe('unresolvedFrom with priced services', () => {
  it('does NOT call a billable priced row unresolved', () => {
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
  const onlyProductions = (over: Partial<GenerarMesRow> = {}) =>
    priced({ monthlyFee: 0, lines: [], selectedLineIds: [], ...over })

  it('adds the ticked productions to the amount, discounted like the rest', () => {
    expect(billedAmount(priced()).amount).toBe(285_000)
    expect(billedAmount(priced({ selectedProductionIds: ['p2'] })).amount).toBe(175_000)
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
