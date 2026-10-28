import type { Page, Route } from '@playwright/test'

import type { ClientDto } from '@/api/clients'
import type { PaymentDto } from '@/api/payments'
import type { ReceivableDto } from '@/api/receivables'
import type { TeamMemberDto } from '@/api/team'

/**
 * API mock for the Playwright harness. The app is wired to a real backend
 * (`src/api/*`), so every authenticated surface fetches on mount; with no backend
 * running, unstubbed calls fail and trip the 401→refresh→logout path, bouncing the
 * walkthrough to `/login`. This fixture answers every API call: the session, a
 * catch-all so nothing fails, and the shapes the mappers parse.
 *
 * TWO invariants that were learned the hard way:
 *  1. Every stub is scoped to the API host (`**​/localhost:3010/…`). A bare path glob
 *     like `**​/clients` ALSO matches the front's own SPA navigation
 *     (`localhost:5173/clients`) and fulfils it with JSON — the page then renders raw
 *     JSON instead of the app. Host-scoping is mandatory.
 *  2. The role walkthrough drives the real UI, so data-dependent surfaces need seed
 *     rows: the employee self-view and the manager `?open=tm-mica` deep-link both key
 *     off a member with id `tm-mica` (`CURRENT_EMPLOYEE_MEMBER_ID`), and the clients
 *     roster needs a row to act on. `DEFAULT_SEED` provides a minimal representative set.
 *
 * Playwright matches routes most-recently-registered first, so the catch-all is
 * registered FIRST and specific stubs LAST (specifics win). Money-flow specs layer
 * more specific stubs on top via `stubJson` / `stubRoute`.
 */
export type Role = 'owner' | 'admin' | 'employee'

const ACCESS_TOKEN_KEY = 'hold:accessToken'
/** env.apiUrl default (src/lib/env.ts). Every stub scopes to this host. */
const API = '**/localhost:3010'

function fakeSession(role: Role): Record<string, unknown> {
  return {
    userId: '00000000-0000-4000-8000-000000000001',
    role,
    // The employee self-view resolves its member from CURRENT_EMPLOYEE_MEMBER_ID
    // ('tm-mica'), not the session; kept aligned here for realism.
    teamMemberId: role === 'employee' ? 'tm-mica' : null,
    email: `${role}@hold.local`,
    firstName: 'Walkthrough',
    lastName: role[0].toUpperCase() + role.slice(1),
  }
}

const EMPTY_SUMMARY = {
  period: null,
  revenue: { billedMinor: '0', collectedMinor: '0', count: 0 },
  payouts: { totalMinor: '0', paidMinor: '0', count: 0 },
  payments: { totalMinor: '0', paidMinor: '0', count: 0 },
  netCollectedMinusPaidMinor: '0',
}

const emptyPosition = {
  ars: { operatingMinor: '0', reserveMinor: '0', totalMinor: '0' },
  usd: { operatingMinor: '0', reserveMinor: '0', totalMinor: '0' },
  fci: { operatingMinor: '0', reserveMinor: '0', totalMinor: '0' },
}

/** Wrap a row set in the paginated envelope the list mappers expect. */
function paginated<T>(items: T[]): { items: T[]; total: number; limit: number; offset: number } {
  return { items, total: items.length, limit: 100, offset: 0 }
}

/** The API's cap on a list read: `listClientsQuerySchema` and `listTeamQuerySchema` both
 *  declare `limit.max(100)`. */
const API_LIST_LIMIT = 100

/**
 * Answer a list read the way the API does, INCLUDING its refusal.
 *
 * A stub that returns 200 to any query cannot catch a caller asking for a page the backend
 * rejects, and one did: the commitment dialog's counterparty picker asked for `limit=200`,
 * every fetch was a 400, and the whole entity-link feature was inert in production while
 * unit tests, typecheck, guardrails and CI were all green. A mock that is more permissive
 * than the thing it stands in for is not a test double, it is a blindfold.
 */
function capped(body: unknown): (route: Route) => void {
  return (route) => {
    const limit = Number(new URL(route.request().url()).searchParams.get('limit') ?? '0')
    if (limit > API_LIST_LIMIT) {
      return json({ error: { code: 'BAD_REQUEST', message: `limit must be <= ${API_LIST_LIMIT}` } }, 400)(route)
    }
    return json(body)(route)
  }
}

// ── Seed data ────────────────────────────────────────────────────────────────
export interface Seed {
  clients?: ClientDto[]
  receivables?: ReceivableDto[]
  payments?: PaymentDto[]
  teamMembers?: TeamMemberDto[]
  /** Overrides merged over the empty plan bundle for GET /months/:period/plan. */
  bundle?: Record<string, unknown>
  /** Override GET /reports/profitability (default: a representative margin spread). */
  profitability?: unknown
  /** Override GET /reports/capacity (default: a representative member set). */
  capacity?: unknown
  /** Override GET /reports/productivity (default: a few logged-hours rows). */
  productivity?: unknown
  /** Override GET /invoice-emitters (default: one usable monotributo). */
  emitters?: unknown
}

/** One monotributo well below its ceiling, so issuing is allowed by default. */
const DEFAULT_EMITTERS = [
  {
    id: '00000000-0000-4000-8000-0000000000e1',
    code: 'monotributo_1',
    label: 'Monotributo Vicky',
    cuit: '27-30123456-4',
    // A NUMBER, because `InvoiceEmitterDto.puntoDeVenta` is an `Int` server-side. It was
    // '0001' here, shaped to the FRONT's belief rather than to the API — and the front
    // was wrong, so every real emitter fetch threw a ZodError while this stub sailed
    // through. A double moulded to the caller instead of to the thing it stands in for
    // does not catch the mismatch, it hides it.
    puntoDeVenta: 1,
    connected: true,
    monthlyLimitMinor: '500000000',
    annualLimitMinor: '6000000000',
    monthIssuedMinor: '100000000',
  },
]

/** One `GET /reports/profitability` client row. Cost sits entirely in `design` for
 *  the fixture; only the margin drives the dashboard/reportes charts. */
function profitabilityRow(clientId: string, clientName: string, billed: number, costTotal: number, marginPct: number) {
  return {
    clientId,
    clientName,
    billedMinor: String(billed),
    collectedMinor: String(billed),
    collectionRatePct: 100,
    costDesignMinor: String(costTotal),
    costCommMinor: '0',
    costProductionMinor: '0',
    costViaticsMinor: '0',
    costPautaMinor: '0',
    costFixedMinor: '0',
    costTotalMinor: String(costTotal),
    marginMinor: String(billed - costTotal),
    marginPct,
  }
}

/** Representative per-client profitability: a spread of margins including a steep
 *  negative, so the dashboard's best/low margin charts (and the label-collision guard)
 *  have real bars to render. */
const DEFAULT_PROFITABILITY = {
  period: '2026-06',
  byClient: [
    profitabilityRow('cli-1', 'Estudio Uno', 300_000_000, 174_000_000, 42),
    profitabilityRow('cli-2', 'Estudio Dos', 240_000_000, 172_800_000, 28),
    profitabilityRow('cli-3', 'Estudio Tres', 180_000_000, 153_000_000, 15),
    profitabilityRow('cli-4', 'Estudio Cuatro', 150_000_000, 162_000_000, -8),
    profitabilityRow('cli-5', 'Estudio Cinco', 120_000_000, 174_000_000, -45),
  ],
}

/** Representative per-member capacity: real monthly cost, hours unset ("sin datos"). */
const DEFAULT_CAPACITY = {
  members: [
    {
      personId: 'tm-mica',
      personName: 'Micaela Duarte',
      role: 'Contadora',
      clientsActive: 2,
      clientNames: ['Estudio Uno', 'Estudio Dos'],
      hoursAllocated: 0,
      capacityHours: null,
      utilizationPct: null,
      teamCostMinor: '80000000',
    },
    {
      personId: 'tm-two',
      personName: 'Bruno Sosa',
      role: 'Analista',
      clientsActive: 1,
      clientNames: ['Estudio Tres'],
      hoursAllocated: 0,
      capacityHours: null,
      utilizationPct: null,
      teamCostMinor: '60000000',
    },
    {
      // Deep-linked by the reports-entity-drawers specs (?open=person:tm-sol).
      personId: 'tm-sol',
      personName: 'Sol Ramírez',
      role: 'Diseño',
      clientsActive: 2,
      clientNames: ['Estudio Cuatro', 'Estudio Cinco'],
      hoursAllocated: 0,
      capacityHours: null,
      utilizationPct: null,
      teamCostMinor: '70000000',
    },
  ],
}

/** Representative `GET /reports/productivity` rows (logged hours per task). Persons match
 *  DEFAULT_CAPACITY so a row's person drawer has a cohort. */
const DEFAULT_PRODUCTIVITY = {
  period: '2026-06',
  items: [
    { id: 'te-1', personId: 'tm-mica', personName: 'Micaela Duarte', clientId: 'cli-1', clientName: 'Estudio Uno', taskType: 'Contabilidad', service: 'General', hours: 6, date: '2026-06-05', isExtra: false, clientStatus: 'active' },
    { id: 'te-2', personId: 'tm-two', personName: 'Bruno Sosa', clientId: 'cli-3', clientName: 'Estudio Tres', taskType: 'Análisis', service: 'General', hours: 4, date: '2026-06-08', isExtra: false, clientStatus: 'active' },
    { id: 'te-3', personId: 'tm-sol', personName: 'Sol Ramírez', clientId: 'cli-4', clientName: 'Estudio Cuatro', taskType: 'Diseño', service: 'General', hours: 5, date: '2026-06-10', isExtra: true, clientStatus: 'active' },
  ],
}

/** The signed-in employee's own roster member (id must equal CURRENT_EMPLOYEE_MEMBER_ID). */
const MEMBER_MICA: TeamMemberDto = {
  id: 'tm-mica',
  name: 'Micaela Duarte',
  role: 'Contadora',
  status: 'active',
  employmentType: 'full_time',
  compensationModel: 'monthly_fixed',
  currency: 'ARS',
  hourlyRateMinor: null,
  monthlyAmountMinor: '80000000',
  productionRateMinor: null,
  taxId: null,
  email: 'mica@hold.local',
  phone: null,
  notes: null,
  startDate: '2025-01-01',
  createdAt: '2026-06-01T00:00:00.000Z',
}

const MEMBER_TWO: TeamMemberDto = {
  ...MEMBER_MICA,
  id: 'tm-two',
  name: 'Bruno Sosa',
  role: 'Analista',
  monthlyAmountMinor: '60000000',
  email: 'bruno@hold.local',
}

const CLIENT_ONE: ClientDto = {
  id: 'cli-1',
  name: 'Estudio Uno',
  businessName: null,
  taxId: null,
  status: 'active',
  monthlyFeeMinor: '15000000',
  currency: 'ARS',
  billingEntityId: null,
  startDate: null,
  lastIncreaseDate: null,
  contactName: null,
  billingEmail: null,
  phone: null,
  createdAt: '2026-06-01T00:00:00.000Z',
}

const CLIENT_TWO: ClientDto = { ...CLIENT_ONE, id: 'cli-2', name: 'Estudio Dos' }

/** Minimal representative data so the role walkthrough's interactions have targets. */
const DEFAULT_SEED: Required<Pick<Seed, 'clients' | 'teamMembers'>> = {
  clients: [CLIENT_ONE, CLIENT_TWO],
  teamMembers: [MEMBER_MICA, MEMBER_TWO],
}

function bundleFor(seed: Seed): Record<string, unknown> {
  return {
    period: '2026-06',
    status: 'draft',
    checklist: {},
    receivables: [],
    payouts: [],
    productions: [],
    expenses: [],
    alerts: [],
    monotributo: [],
    members: [],
    ...seed.bundle,
  }
}

const json = (body: unknown, status = 200) => (route: Route) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** Register a JSON stub for an API PATH glob (host-scoped automatically). Later
 *  registrations win, so money-flow specs call this AFTER `mockApi` to override. */
export async function stubJson(page: Page, pathGlob: string, body: unknown, status = 200): Promise<void> {
  await page.route(`${API}${pathGlob}`, json(body, status))
}

/** Register a method-aware handler for an API PATH glob (host-scoped). For stateful
 *  money-flow stubs where POST/PUT mutate an in-memory store the GET then reflects. */
export async function stubRoute(page: Page, pathGlob: string, handler: (route: Route) => void): Promise<void> {
  await page.route(`${API}${pathGlob}`, handler)
}

/** Answer every API call the app makes so no surface fails or logs out. */
export async function mockApi(page: Page, role: Role = 'owner', seed: Seed = {}): Promise<void> {
  const clients = seed.clients ?? DEFAULT_SEED.clients
  const teamMembers = seed.teamMembers ?? DEFAULT_SEED.teamMembers
  const receivables = seed.receivables ?? []
  const payments = seed.payments ?? []

  await page.addInitScript((key) => window.localStorage.setItem(key, 'e2e-mock-token'), ACCESS_TOKEN_KEY)

  // Catch-all FIRST (least specific): any unstubbed API call → 200 empty object.
  // Host-scoped so it never intercepts the front's own SPA route navigations.
  await page.route(`${API}/**`, json({}))

  // Session + token refresh (so a refresh never logs the walkthrough out).
  await page.route(`${API}/auth/me`, json(fakeSession(role)))
  await page.route(`${API}/auth/refresh`, json({ accessToken: 'x', refreshToken: 'y', tokenType: 'Bearer' }))

  // List endpoints — host-scoped so front routes (localhost:5173/clients) are safe.
  await page.route(`${API}/clients`, json(paginated(clients)))
  await page.route(`${API}/clients?**`, capped(paginated(clients)))
  await page.route(`${API}/receivables`, json(paginated(receivables)))
  await page.route(`${API}/receivables?**`, json(paginated(receivables)))
  await page.route(`${API}/payments`, json(paginated(payments)))
  await page.route(`${API}/payments?**`, json(paginated(payments)))
  await page.route(`${API}/team-members`, json(paginated(teamMembers)))
  await page.route(`${API}/team-members?**`, capped(paginated(teamMembers)))
  // Cargar horas + the capability-gated bank sub-resource (both loaded by the team surface).
  await page.route(`${API}/time-entries`, json([]))
  await page.route(`${API}/time-entries?**`, json([]))
  // Member activity (viáticos + extra work) — the team store hydrates these on mount.
  await page.route(`${API}/member-expenses`, json([]))
  await page.route(`${API}/member-expenses?**`, json([]))
  await page.route(`${API}/member-extras`, json([]))
  await page.route(`${API}/member-extras?**`, json([]))
  await page.route(`${API}/team-members/*/bank`, json(null))
  await page.route(`${API}/providers`, json([]))
  // Custom roles list (settings-members assign picker, owner-only) — empty by default.
  await page.route(`${API}/roles`, json([]))
  // A real emisor, not `[]`: with none, every invoice action correctly refuses to issue,
  // so an empty list would make the whole facturación path untestable AND make a broken
  // one look like the intended refusal.
  await page.route(`${API}/invoice-emitters`, json(seed.emitters ?? DEFAULT_EMITTERS))
  await page.route(`${API}/treasury/accounts`, json([]))
  await page.route(`${API}/treasury/commitments`, json([]))
  // The settlement movements behind the balances. The catch-all's `{}` is NOT enough: the
  // mapper reads `res.totals` and the treasury store counts this query in its own loading
  // and error state, so an unanswered shape left `/cashflow` loading forever and every tab
  // unreachable. Provenance only — these are already inside the balances.
  await page.route(`${API}/treasury/movements**`, json({ items: [], totals: [] }))
  // The payroll the Posición counts as pending. Its shape must be the PAGED envelope,
  // not `[]` or `{}`: `fetchOutstandingPayouts` loops until `items.length >= total`, so a
  // stub missing `total` either throws on the response schema or spins forever — and this
  // query is in `/cashflow`'s loading and error state, which is what left the page loading
  // forever when `/treasury/movements` was added without a stub.
  await page.route(`${API}/payout-statements?**`, json({ items: [], total: 0, limit: 100, offset: 0 }))
  await page.route(`${API}/treasury/position`, json(emptyPosition))
  await page.route(`${API}/treasury/projection**`, json({ lane: 'ARS', startingBalanceMinor: '0', weeks: [] }))
  await page.route(`${API}/months`, json([]))
  // Mirrors the route's own validator (`period must be YYYY-MM`) instead of answering
  // any glob match. A stub that accepts every shape let a caller pass `YYYY-MM-01`,
  // pass every spec, and 400 against the real API — which is exactly what happened to
  // the /team payout fetch, and only the live stack caught it.
  await page.route(`${API}/months/*/plan`, (route) => {
    const period = new URL(route.request().url()).pathname.split('/')[2]
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'BAD_REQUEST', message: 'Validation failed', details: { fieldErrors: { period: ['period must be YYYY-MM'] } } },
        }),
      })
    }
    return json(bundleFor(seed))(route)
  })
  await page.route(`${API}/months/*/close-blockers`, json([]))
  // Settings → Miembros reads the real workspace users; the catch-all's `{}` would fail
  // the array schema, so answer with the signed-in role's own user.
  await page.route(`${API}/users`, json([
    {
      id: '00000000-0000-4000-8000-000000000001',
      email: `${role}@hold.local`,
      firstName: 'Walkthrough',
      lastName: role[0].toUpperCase() + role.slice(1),
      role,
      status: 'active',
      teamMemberId: null,
    },
  ]))
  await page.route(`${API}/reports/summary**`, json(EMPTY_SUMMARY))
  await page.route(`${API}/reports/profitability**`, json(seed.profitability ?? DEFAULT_PROFITABILITY))
  await page.route(`${API}/reports/capacity**`, json(seed.capacity ?? DEFAULT_CAPACITY))
  await page.route(`${API}/reports/productivity**`, json(seed.productivity ?? DEFAULT_PRODUCTIVITY))
  await page.route(`${API}/reports/margin-history**`, json({ points: [] }))
  await page.route(`${API}/reports/hours-history**`, json({ points: [] }))
  // The rail polls the unread count on every screen; the settings section reads prefs.
  await page.route(`${API}/notifications**`, json({ items: [], unread: 0 }))
  await page.route(`${API}/me/notification-preferences`, json({
    'month.closed': true,
    'payment.approved': true,
    'statement.sent': true,
  }))
}
