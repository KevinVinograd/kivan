import { describe, expect, it } from 'vitest'
import { appendCrumb, buildTrailHref, parseTrail, trailToHere, type Crumb } from './nav-trail'

/** Parse the `trail` param out of an href the same way the router would (one
 *  percent-decode pass via the URL parser), so round-trip tests mirror runtime. */
function trailOf(href: string): Crumb[] {
  const params = new URL(`http://h${href}`).searchParams
  return parseTrail(params)
}

describe('parseTrail', () => {
  it('returns [] when the trail param is missing', () => {
    expect(parseTrail(new URLSearchParams())).toEqual([])
  })

  it('returns [] for a legacy ?from= link with no trail param', () => {
    expect(parseTrail(new URLSearchParams('from=dashboard'))).toEqual([])
  })

  it('returns [] for a malformed (non-JSON) trail value without throwing', () => {
    expect(parseTrail(new URLSearchParams('trail=not-json'))).toEqual([])
  })

  it('returns [] when the decoded JSON is not an array', () => {
    const value = encodeURIComponent(JSON.stringify({ label: 'x', to: '/y' }))
    expect(parseTrail(new URLSearchParams(`trail=${value}`))).toEqual([])
  })

  it('drops entries missing a string label or to', () => {
    const value = encodeURIComponent(
      JSON.stringify([{ label: 'Ok', to: '/ok' }, { label: 'NoTo' }, { to: '/no-label' }, 7]),
    )
    expect(parseTrail(new URLSearchParams(`trail=${value}`))).toEqual([{ label: 'Ok', to: '/ok' }])
  })

  it('parses a valid multi-crumb trail in order', () => {
    const crumbs: Crumb[] = [
      { label: 'Dashboard', to: '/dashboard' },
      { label: 'Clientes', to: '/clients' },
    ]
    const value = encodeURIComponent(JSON.stringify(crumbs))
    expect(parseTrail(new URLSearchParams(`trail=${value}`))).toEqual(crumbs)
  })

  it('rejects crumbs whose `to` is not an internal path (open-redirect guard)', () => {
    const value = encodeURIComponent(
      JSON.stringify([
        { label: 'Inicio', to: '//evil.com' },
        { label: 'Http', to: 'http://evil.com' },
        { label: 'Js', to: 'javascript:alert(1)' },
        { label: 'Backslash', to: '/\\evil.com' },
        { label: 'Relative', to: 'clients' },
        { label: 'Ok', to: '/clients?open=1' },
      ]),
    )
    expect(parseTrail(new URLSearchParams(`trail=${value}`))).toEqual([
      { label: 'Ok', to: '/clients?open=1' },
    ])
  })
})

describe('trailToHere', () => {
  it('returns the whole trail when the current page is not in it', () => {
    const value = encodeURIComponent(JSON.stringify([{ label: 'Dashboard', to: '/dashboard' }]))
    expect(trailToHere(new URLSearchParams(`trail=${value}`), '/clients')).toEqual([
      { label: 'Dashboard', to: '/dashboard' },
    ])
  })

  it('collapses a loop back to the current page (drops its crumb and everything after)', () => {
    // Dashboard -> Clientes -> Equipo, then back to /clients: the rendered trail
    // must be just [Dashboard], not the misleading [Dashboard, Equipo].
    const value = encodeURIComponent(
      JSON.stringify([
        { label: 'Dashboard', to: '/dashboard' },
        { label: 'Clientes', to: '/clients' },
        { label: 'Equipo', to: '/team' },
      ]),
    )
    expect(trailToHere(new URLSearchParams(`trail=${value}`), '/clients')).toEqual([
      { label: 'Dashboard', to: '/dashboard' },
    ])
  })

  it('matches the page by path, ignoring a crumb query string', () => {
    const value = encodeURIComponent(
      JSON.stringify([
        { label: 'Reportes', to: '/reports?tab=finanzas' },
        { label: 'Clientes', to: '/clients' },
      ]),
    )
    expect(trailToHere(new URLSearchParams(`trail=${value}`), '/clients')).toEqual([
      { label: 'Reportes', to: '/reports?tab=finanzas' },
    ])
  })
})

describe('appendCrumb', () => {
  it('starts a fresh trail from empty params', () => {
    const value = appendCrumb(new URLSearchParams(), { label: 'Dashboard', to: '/dashboard' })
    expect(trailOf(`/clients?trail=${value}`)).toEqual([{ label: 'Dashboard', to: '/dashboard' }])
  })

  it('carries the incoming trail forward and appends', () => {
    const incoming = encodeURIComponent(JSON.stringify([{ label: 'Dashboard', to: '/dashboard' }]))
    const value = appendCrumb(new URLSearchParams(`trail=${incoming}`), { label: 'Clientes', to: '/clients' })
    expect(trailOf(`/cobros?trail=${value}`)).toEqual([
      { label: 'Dashboard', to: '/dashboard' },
      { label: 'Clientes', to: '/clients' },
    ])
  })

  it('does not duplicate a crumb whose `to` equals the last crumb', () => {
    const incoming = encodeURIComponent(JSON.stringify([{ label: 'Clientes', to: '/clients' }]))
    const value = appendCrumb(new URLSearchParams(`trail=${incoming}`), { label: 'Clientes', to: '/clients' })
    expect(trailOf(`/x?trail=${value}`)).toEqual([{ label: 'Clientes', to: '/clients' }])
  })

  it('collapses a non-adjacent revisit back to the existing crumb (bounds the URL)', () => {
    // [Dashboard, Clientes, Equipo] then leaving /clients again -> appends Clientes,
    // which already exists at index 1, so it collapses to [Dashboard, Clientes].
    const incoming = encodeURIComponent(
      JSON.stringify([
        { label: 'Dashboard', to: '/dashboard' },
        { label: 'Clientes', to: '/clients' },
        { label: 'Equipo', to: '/team' },
      ]),
    )
    const value = appendCrumb(new URLSearchParams(`trail=${incoming}`), { label: 'Clientes', to: '/clients' })
    expect(trailOf(`/team?trail=${value}`)).toEqual([
      { label: 'Dashboard', to: '/dashboard' },
      { label: 'Clientes', to: '/clients' },
    ])
  })
})

describe('buildTrailHref', () => {
  it('appends the trail with `?` when the base href has no query', () => {
    const href = buildTrailHref('/clients', { label: 'Dashboard', to: '/dashboard' }, new URLSearchParams())
    expect(href.startsWith('/clients?trail=')).toBe(true)
    expect(trailOf(href)).toEqual([{ label: 'Dashboard', to: '/dashboard' }])
  })

  it('appends the trail with `&` when the base href already has a query', () => {
    const href = buildTrailHref('/cobros?open=42&period=2026-06', { label: 'Clientes', to: '/clients' }, new URLSearchParams())
    expect(href).toContain('/cobros?open=42&period=2026-06&trail=')
    expect(trailOf(href)).toEqual([{ label: 'Clientes', to: '/clients' }])
  })

  it('round-trips labels with spaces and a `to` that itself carries a query', () => {
    const crumb: Crumb = { label: 'Cuentas corrientes', to: '/cuentas-corrientes' }
    const href = buildTrailHref('/cobros?open=7', crumb, new URLSearchParams())
    expect(trailOf(href)).toEqual([crumb])

    const reportCrumb: Crumb = { label: 'Reportes', to: '/reports?tab=finanzas' }
    const href2 = buildTrailHref('/cobros?open=7', reportCrumb, new URLSearchParams())
    expect(trailOf(href2)).toEqual([reportCrumb])
  })

  it('accumulates across multiple hops (unlimited depth)', () => {
    const v1 = buildTrailHref('/clients', { label: 'Dashboard', to: '/dashboard' }, new URLSearchParams())
    const afterClients = new URL(`http://h${v1}`).searchParams
    const v2 = buildTrailHref('/cobros?open=42', { label: 'Clientes', to: '/clients' }, afterClients)
    expect(trailOf(v2)).toEqual([
      { label: 'Dashboard', to: '/dashboard' },
      { label: 'Clientes', to: '/clients' },
    ])
  })
})
