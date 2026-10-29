export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  users: {
    all: ['users'] as const,
  },
  workspace: {
    current: ['workspace'] as const,
  },
  clients: {
    all: ['clients'] as const,
    lists: () => [...queryKeys.clients.all, 'list'] as const,
    list: (params: Record<string, unknown>) => [...queryKeys.clients.lists(), params] as const,
    detail: (id: string) => [...queryKeys.clients.all, 'detail', id] as const,
    assignments: (clientId: string) =>
      [...queryKeys.clients.all, 'assignments', clientId] as const,
    serviceLines: (clientId: string) =>
      [...queryKeys.clients.all, 'service-lines', clientId] as const,
    productions: (clientId: string) => [...queryKeys.clients.all, 'productions', clientId] as const,
    productionsAll: () => [...queryKeys.clients.all, 'productions'] as const,
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
    clientMonth: (clientId: string, period: string) =>
      [...queryKeys.reports.all, 'client-month', clientId, period] as const,
  },
  roles: {
    all: ['roles'] as const,
    lists: () => [...queryKeys.roles.all, 'list'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (unread: boolean) => [...queryKeys.notifications.all, 'list', unread] as const,
    prefs: () => [...queryKeys.notifications.all, 'prefs'] as const,
  },
  treasury: {
    all: ['treasury'] as const,
    accounts: () => [...queryKeys.treasury.all, 'accounts'] as const,
    commitments: () => [...queryKeys.treasury.all, 'commitments'] as const,
    movements: (from: string) => [...queryKeys.treasury.all, 'movements', from] as const,
  },
  ledger: {
    all: ['ledger'] as const,
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
    byMemberPeriod: (teamMemberId: string, period: string) =>
      [...queryKeys.payouts.all, 'member', teamMemberId, period] as const,
    outstanding: () => [...queryKeys.payouts.all, 'outstanding'] as const,
  },
  payments: {
    all: ['payments'] as const,
    bank: (id: string) => [...queryKeys.payments.all, 'bank', id] as const,
    providers: () => [...queryKeys.payments.all, 'providers'] as const,
  },
  team: {
    all: ['team'] as const,
    lists: () => [...queryKeys.team.all, 'list'] as const,
    roster: () => [...queryKeys.team.all, 'roster'] as const,
    productionPeople: () => [...queryKeys.team.all, 'production-people'] as const,
  },
} as const
