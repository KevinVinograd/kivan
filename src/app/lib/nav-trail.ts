/**
 * Navigation trail: a breadcrumb back-path accumulated in the URL so a deep-linked
 * page can offer the user every step they passed through, not just the last hop.
 *
 * The path lives in a single `?trail=` query param as a percent-encoded JSON array
 * of `{ label, to }` crumbs. Each page that deep-links somewhere reads its OWN
 * incoming trail and appends a crumb for itself (`buildTrailHref`); the destination
 * decodes the path with `trailToHere` (which collapses any loop back to the current
 * page) and renders each crumb as a link plus its own title as the leaf.
 *
 * Bounded growth: `withCrumb` collapses a revisit — re-entering a page already in
 * the trail truncates back to it rather than stacking a duplicate — so a
 * back-and-forth loop cannot grow the URL without bound.
 *
 * Safety: `to` is validated as an internal path (a single leading `/`), so a
 * hand-edited or crafted `?trail=` cannot inject an off-origin `to` that a
 * breadcrumb `<Link>` would treat as an external navigation (open redirect). This
 * preserves the old per-page `backTrail` allowlist's internal-only invariant.
 *
 * Encoding note: React Router's `useSearchParams` percent-decodes values on read,
 * so the param must survive exactly one decode pass — hence
 * `encodeURIComponent(JSON.stringify(...))` on write and `JSON.parse` on the
 * already-decoded value on read. Parsing is defensive: a missing, malformed, or
 * non-conforming param yields an empty trail (no throw, no breadcrumb), so stale
 * `?from=` links and hand-edited URLs degrade gracefully.
 */

export type Crumb = { label: string; to: string }

const TRAIL_PARAM = 'trail'

/** A safe internal route target: one leading `/` not followed by `/` or `\` (which
 *  browsers/React Router would treat as protocol-relative / external). Rejects
 *  `//evil.com`, `http(s)://…`, `javascript:…`, and empty/relative values. */
function isInternalPath(to: string): boolean {
  return /^\/(?![/\\])/.test(to)
}

function isCrumb(value: unknown): value is Crumb {
  if (typeof value !== 'object' || value === null) return false
  const { label, to } = value as Crumb
  return typeof label === 'string' && typeof to === 'string' && isInternalPath(to)
}

/** The route portion of a crumb target, ignoring any query (so `/reports` and
 *  `/reports?tab=finanzas` count as the same page for loop collapse). */
function pathOf(to: string): string {
  return to.split('?')[0]
}

/** Decode the accumulated trail from the current search params. Never throws —
 *  returns `[]` for a missing, malformed, or non-array `trail` value, and skips
 *  any element that is not a `{ label, to }` pair with an internal `to`. */
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

/** The trail the destination at `ownPath` should render: the incoming trail
 *  truncated at the current page's own crumb if present, so a loop back to this
 *  page collapses (and the page never appears as a link before its own leaf). */
export function trailToHere(params: URLSearchParams, ownPath: string): Crumb[] {
  const trail = parseTrail(params)
  const here = trail.findIndex((crumb) => pathOf(crumb.to) === ownPath)
  return here === -1 ? trail : trail.slice(0, here)
}

/** The trail after appending `crumb` to the trail carried by `params`. If `crumb`
 *  revisits a page already in the trail, the trail collapses back to that page
 *  (drops the looped-through crumbs) instead of stacking a duplicate — this keeps
 *  the path unique and bounds the URL under back-and-forth navigation. */
function withCrumb(params: URLSearchParams, crumb: Crumb): Crumb[] {
  const trail = parseTrail(params)
  const existing = trail.findIndex((c) => pathOf(c.to) === pathOf(crumb.to))
  return existing === -1 ? [...trail, crumb] : [...trail.slice(0, existing), crumb]
}

/** The ready-to-insert `trail` param VALUE (percent-encoded) for the incoming
 *  trail in `params` plus `crumb`. Use when building a query string by hand. */
export function appendCrumb(params: URLSearchParams, crumb: Crumb): string {
  return encodeURIComponent(JSON.stringify(withCrumb(params, crumb)))
}

/** A deep-link href to `baseHref` that carries the trail from `params` forward and
 *  appends `crumb` (the page being left). `baseHref` may already include a query
 *  (e.g. `?open=42&period=2026-06`); the trail param is merged with the right
 *  separator. This is the single entry point producers use to navigate deeper. */
export function buildTrailHref(baseHref: string, crumb: Crumb, params: URLSearchParams): string {
  const separator = baseHref.includes('?') ? '&' : '?'
  return `${baseHref}${separator}${TRAIL_PARAM}=${appendCrumb(params, crumb)}`
}
