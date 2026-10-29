import type { Page, Route } from '@playwright/test'

import type { ClientDto } from '@/api/clients'
import type { PaymentDto } from '@/api/payments'
import type { ReceivableDto } from '@/api/receivables'
import type { TeamMemberDto } from '@/api/team'

export type Role = 'owner' | 'admin' | 'employee'

const ACCESS_TOKEN_KEY = 'hold:accessToken'
const API = '**/localhost:3010'

function fakeSession(role: Role): Record<string, unknown> {
  return {
    userId: '00000000-0000-4000-8000-000000000001',
    role,
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

function paginated<T>(items: T[]): { items: T[]; total: number; limit: number; offset: number } {
  return { items, total: items.length, limit: 100, offset: 0 }
}

const API_LIST_LIMIT = 100

function capped(body: unknown): (route: Route) => void {
  return (route) => {
    const limit = Number(new URL(route.request().url()).searchParams.get('limit') ?? '0')
    if (limit > API_LIST_LIMIT) {
      return json({ error: { code: 'BAD_REQUEST', message: `limit must be <= ${API_LIST_LIMIT}` } }, 400)(route)
    }
    return json(body)(route)
  }
}

export interface Seed {
  clients?: ClientDto[]
  receivables?: ReceivableDto[]
  payments?: PaymentDto[]
  teamMembers?: TeamMemberDto[]
  bundle?: Record<string, unknown>
  profitability?: unknown
  capacity?: unknown
  productivity?: unknown
  emitters?: unknown
}

const DEFAULT_EMITTERS = [
  {
    id: '00000000-0000-4000-8000-0000000000e1',
    code: 'monotributo_1',
    label: 'Monotributo Vicky',
    cuit: '27-30123456-4',
    puntoDeVenta: 1,
    connected: true,
    monthlyLimitMinor: '500000000',
    annualLimitMinor: '6000000000',
    monthIssuedMinor: '100000000',
  },
]

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

const DEFAULT_PRODUCTIVITY = {
  period: '2026-06',
  items: [
    { id: 'te-1', personId: 'tm-mica', personName: 'Micaela Duarte', clientId: 'cli-1', clientName: 'Estudio Uno', taskType: 'Contabilidad', service: 'General', hours: 6, date: '2026-06-05', isExtra: false, clientStatus: 'active' },
    { id: 'te-2', personId: 'tm-two', personName: 'Bruno Sosa', clientId: 'cli-3', clientName: 'Estudio Tres', taskType: 'Análisis', service: 'General', hours: 4, date: '2026-06-08', isExtra: false, clientStatus: 'active' },
    { id: 'te-3', personId: 'tm-sol', personName: 'Sol Ramírez', clientId: 'cli-4', clientName: 'Estudio Cuatro', taskType: 'Diseño', service: 'General', hours: 5, date: '2026-06-10', isExtra: true, clientStatus: 'active' },
  ],
}

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

export async function stubJson(page: Page, pathGlob: string, body: unknown, status = 200): Promise<void> {
  await page.route(`${API}${pathGlob}`, json(body, status))
}

export async function stubRoute(page: Page, pathGlob: string, handler: (route: Route) => void): Promise<void> {
  await page.route(`${API}${pathGlob}`, handler)
}

export async function mockApi(page: Page, role: Role = 'owner', seed: Seed = {}): Promise<void> {
  const clients = seed.clients ?? DEFAULT_SEED.clients
  const teamMembers = seed.teamMembers ?? DEFAULT_SEED.teamMembers
  const receivables = seed.receivables ?? []
  const payments = seed.payments ?? []

  await page.addInitScript((key) => window.localStorage.setItem(key, 'e2e-mock-token'), ACCESS_TOKEN_KEY)

  await page.route(`${API}/**`, json({}))

  await page.route(`${API}/auth/me`, json(fakeSession(role)))
  await page.route(`${API}/auth/refresh`, json({ accessToken: 'x', refreshToken: 'y', tokenType: 'Bearer' }))

  await page.route(`${API}/clients`, json(paginated(clients)))
  await page.route(`${API}/clients?**`, capped(paginated(clients)))
  await page.route(`${API}/receivables`, json(paginated(receivables)))
  await page.route(`${API}/receivables?**`, json(paginated(receivables)))
  await page.route(`${API}/payments`, json(paginated(payments)))
  await page.route(`${API}/payments?**`, json(paginated(payments)))
  await page.route(`${API}/team-members`, json(paginated(teamMembers)))
  await page.route(`${API}/team-members?**`, capped(paginated(teamMembers)))
  await page.route(`${API}/time-entries`, json([]))
  await page.route(`${API}/time-entries?**`, json([]))
  await page.route(`${API}/member-expenses`, json([]))
  await page.route(`${API}/member-expenses?**`, json([]))
  await page.route(`${API}/member-extras`, json([]))
  await page.route(`${API}/member-extras?**`, json([]))
  await page.route(`${API}/team-members/*/bank`, json(null))
  await page.route(`${API}/providers`, json([]))
  await page.route(`${API}/roles`, json([]))
  await page.route(`${API}/invoice-emitters`, json(seed.emitters ?? DEFAULT_EMITTERS))
  await page.route(`${API}/treasury/accounts`, json([]))
  await page.route(`${API}/treasury/commitments`, json([]))
  await page.route(`${API}/treasury/movements**`, json({ items: [], totals: [] }))
  await page.route(`${API}/payout-statements?**`, json({ items: [], total: 0, limit: 100, offset: 0 }))
  await page.route(`${API}/treasury/position`, json(emptyPosition))
  await page.route(`${API}/treasury/projection**`, json({ lane: 'ARS', startingBalanceMinor: '0', weeks: [] }))
  await page.route(`${API}/months`, json([]))
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
  await page.route(`${API}/notifications**`, json({ items: [], unread: 0 }))
  await page.route(`${API}/me/notification-preferences`, json({
    'month.closed': true,
    'payment.approved': true,
    'statement.sent': true,
  }))
}
