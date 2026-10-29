export type Crumb = { label: string; to: string }

const TRAIL_PARAM = 'trail'

function isInternalPath(to: string): boolean {
  return /^\/(?![/\\])/.test(to)
}

function isCrumb(value: unknown): value is Crumb {
  if (typeof value !== 'object' || value === null) return false
  const { label, to } = value as Crumb
  return typeof label === 'string' && typeof to === 'string' && isInternalPath(to)
}

function pathOf(to: string): string {
  return to.split('?')[0]
}

export function parseTrail(params: URLSearchParams): Crumb[] {
  const raw = params.get(TRAIL_PARAM)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isCrumb)
  } catch {
    return []
  }
}

export function trailToHere(params: URLSearchParams, ownPath: string): Crumb[] {
  const trail = parseTrail(params)
  const here = trail.findIndex((crumb) => pathOf(crumb.to) === ownPath)
  return here === -1 ? trail : trail.slice(0, here)
}

function withCrumb(params: URLSearchParams, crumb: Crumb): Crumb[] {
  const trail = parseTrail(params)
  const existing = trail.findIndex((c) => pathOf(c.to) === pathOf(crumb.to))
  return existing === -1 ? [...trail, crumb] : [...trail.slice(0, existing), crumb]
}

export function appendCrumb(params: URLSearchParams, crumb: Crumb): string {
  return encodeURIComponent(JSON.stringify(withCrumb(params, crumb)))
}

export function buildTrailHref(baseHref: string, crumb: Crumb, params: URLSearchParams): string {
  const separator = baseHref.includes('?') ? '&' : '?'
  return `${baseHref}${separator}${TRAIL_PARAM}=${appendCrumb(params, crumb)}`
}
