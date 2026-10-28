/**
 * Query-key factory. Go through this so keys are consistent and invalidation is
 * precise. Extend per resource as pages are wired to the API.
 */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  users: {
    /** The workspace's logins. Shared by Configuración (which manages them) and Equipo
     *  (which offers to create one), so inviting from either refreshes both. */
    all: ['users'] as const,
  },
  workspace: {
    /** The signed-in workspace's settings (name, timezone, fiscal, positionAsOf). */
    current: ['workspace'] as const,
  },
  clients: {
    all: ['clients'] as const,
    lists: () => [...queryKeys.clients.all, 'list'] as const,
    list: (params: Record<string, unknown>) => [...queryKeys.clients.lists(), params] as const,
    detail: (id: string) => [...queryKeys.clients.all, 'detail', id] as const,
    /** Everyone on one client. Invalidated by both assignment mutations. */
    assignments: (clientId: string) =>
      [...queryKeys.clients.all, 'assignments', clientId] as const,
    /** A client's priced contract lines. Their sum IS its monthly fee, so every mutation
     *  here invalidates the client detail and the roster too. */
    serviceLines: (clientId: string) =>
      [...queryKeys.clients.all, 'service-lines', clientId] as const,
    /** One client's productions (the client view's history). `productionsAll` is the
     *  prefix every production write invalidates. */
    productions: (clientId: string) => [...queryKeys.clients.all, 'productions', clientId] as const,
    productionsAll: () => [...queryKeys.clients.all, 'productions'] as const,
    /** Every client one member is on — the mirror direction, its own cache entry. */
    memberAssignments: (teamMemberId: string) =>
      [...queryKeys.clients.all, 'member-assignments', teamMemberId] as const,
  },
  services: {
    all: ['services'] as const,
    lists: () => [...queryKeys.services.all, 'list'] as const,
  },
  receivables: {
    all: ['receivables'] as const,
    lists: () => [...queryKeys.receivables.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.receivables.all, 'detail', id] as const,
  },
  emitters: {
    all: ['emitters'] as const,
    lists: () => [...queryKeys.emitters.all, 'list'] as const,
  },
  reports: {
    all: ['reports'] as const,
    summary: (period: string) => [...queryKeys.reports.all, 'summary', period] as const,
    profitability: (period: string) => [...queryKeys.reports.all, 'profitability', period] as const,
    productivity: (period: string) => [...queryKeys.reports.all, 'productivity', period] as const,
    marginHistory: (clientId?: string) =>
      [...queryKeys.reports.all, 'margin-history', clientId ?? 'all'] as const,
    hoursHistory: (teamMemberId: string) =>
      [...queryKeys.reports.all, 'hours-history', teamMemberId] as const,
    capacity: () => [...queryKeys.reports.all, 'capacity'] as const,
    /** One client's month for its Resumen. Under `reports.all`, so it refreshes with them. */
    clientMonth: (clientId: string, period: string) =>
      [...queryKeys.reports.all, 'client-month', clientId, period] as const,
  },
  roles: {
    all: ['roles'] as const,
    lists: () => [...queryKeys.roles.all, 'list'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    /** The caller's inbox. `unread` is part of the key: the badge and the panel ask
     *  different questions and must not share one cached answer. */
    list: (unread: boolean) => [...queryKeys.notifications.all, 'list', unread] as const,
    prefs: () => [...queryKeys.notifications.all, 'prefs'] as const,
  },
  treasury: {
    all: ['treasury'] as const,
    accounts: () => [...queryKeys.treasury.all, 'accounts'] as const,
    commitments: () => [...queryKeys.treasury.all, 'commitments'] as const,
    /** Keyed by the anchor: "what has moved the balances since they were good as of".
     *  A different anchor is a different question, so it is a different cache entry. */
    movements: (from: string) => [...queryKeys.treasury.all, 'movements', from] as const,
  },
  ledger: {
    all: ['ledger'] as const,
    /** One account's statement. `period` and `currency` are part of the key: the same
     *  account in two months, or in two lanes, is two different answers rather than one
     *  cached one. */
    statement: (entityType: string, entityId: string, period?: string, currency?: string) =>
      [
        ...queryKeys.ledger.all,
        'statement',
        entityType,
        entityId,
        period ?? 'all',
        currency ?? 'all',
      ] as const,
  },
  payouts: {
    all: ['payouts'] as const,
    /** Keyed by (member, period) because that pair is unique on the backend. */
    byMemberPeriod: (teamMemberId: string, period: string) =>
      [...queryKeys.payouts.all, 'member', teamMemberId, period] as const,
    /** Every statement still owing money, across all periods — what the Cashflow
     *  Posición counts as pending payroll. */
    outstanding: () => [...queryKeys.payouts.all, 'outstanding'] as const,
  },
  payments: {
    all: ['payments'] as const,
    bank: (id: string) => [...queryKeys.payments.all, 'bank', id] as const,
    /** The workspace's providers. They live under the payments module server-side. */
    providers: () => [...queryKeys.payments.all, 'providers'] as const,
  },
  team: {
    all: ['team'] as const,
    lists: () => [...queryKeys.team.all, 'list'] as const,
    /** Everyone on the team, for the invite dialog's "link to a person" picker. */
    roster: () => [...queryKeys.team.all, 'roster'] as const,
    /** The names-only roster a communication lead picks a production's people from. */
    productionPeople: () => [...queryKeys.team.all, 'production-people'] as const,
  },
} as const
