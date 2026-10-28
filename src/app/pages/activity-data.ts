/**
 * Actividad por período — feed model + pure selectors.
 *
 * The full log behind the dashboards' "Ver actividad" drawer. There is no backend
 * activity-log endpoint yet, so `getActivityFeed` returns an empty feed and the drawer
 * shows its honest empty state. The types + selectors (filter by preset/type/entity,
 * entity options, summary) are the reusable machinery, ready to run over a real feed
 * once an endpoint exists. Formatting lives in `activity-format.ts`.
 */
import { parseISO } from 'date-fns'

import type { Role } from '@/app/lib/use-role'

/** The nine workspace action kinds (owner/admin ∪ employee). Each maps to a registered icon. */
export type ActivityType =
  | 'cobro'
  | 'horas'
  | 'viatico'
  | 'feedback'
  | 'facturacion'
  | 'banco'
  | 'extra'
  | 'produccion'
  | 'reunion'

/**
 * An entity referenced in an activity line. `client` / `member` render as hover
 * link-text with a preview + "Ver perfil"; `plain` (e.g. a production, which has
 * no profile page) renders as static text.
 */
export type ActivityEntity =
  | { kind: 'client'; id: string; name: string }
  | { kind: 'member'; id: string; name: string; role: string }
  | { kind: 'plain'; name: string }

/** One feed entry: actor + action + context, newest first. */
export type ActivityFeedItem = {
  id: string
  type: ActivityType
  actor: ActivityEntity
  /** Connecting verb phrase between actor and context, e.g. "registró el cobro de". */
  action: string
  context: ActivityEntity
  iso: string
  /** Optional enrichment line under the sentence (amount, hours, reference). */
  detail?: string
}

// ── Time presets ──────────────────────────────────────────────────────────────
export type ActivityPreset = 'hoy' | 'last-week' | 'last-month' | 'last-3-months' | 'all'

/** Preset chips, newest-narrow to widest. Labels are sentence case (C2). */
export const ACTIVITY_PRESETS: { value: ActivityPreset; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'last-week', label: 'Última semana' },
  { value: 'last-month', label: 'Último mes' },
  { value: 'last-3-months', label: 'Últimos 3 meses' },
  { value: 'all', label: 'Todo' },
]

/**
 * The active preset as a standalone scope label, for the count line under the
 * toolbar ("25 movimientos · Último mes"). "all" reads as "Todo el período" —
 * the bare chip label ("Todo") does not stand on its own next to a count.
 */
const PRESET_SCOPE_LABEL: Record<ActivityPreset, string> = {
  hoy: 'Hoy',
  'last-week': 'Última semana',
  'last-month': 'Último mes',
  'last-3-months': 'Últimos 3 meses',
  all: 'Todo el período',
}
export function presetScopeLabel(preset: ActivityPreset): string {
  return PRESET_SCOPE_LABEL[preset]
}

/** The cutoff a preset filters from, or `null` for "all". */
function presetCutoff(preset: ActivityPreset): Date | null {
  const now = new Date()
  switch (preset) {
    case 'hoy': {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      return start
    }
    case 'last-week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case 'last-month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case 'last-3-months':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    case 'all':
      return null
  }
}

/**
 * The expanded activity feed for a role. No backend activity-log endpoint exists yet,
 * so this returns an empty feed and the drawer renders its honest empty state; the pure
 * selectors below are the reusable machinery, ready to run over a real feed later.
 */
export function getActivityFeed(_role: Role): ActivityFeedItem[] {
  return []
}

// ── Selectors ─────────────────────────────────────────────────────────────────
export type ActivityFilters = {
  search: string
  type: ActivityType | 'all'
  /** A specific entity id (client or member) or "all". */
  entity: string | 'all'
  preset: ActivityPreset
}

function matchesSearch(item: ActivityFeedItem, query: string): boolean {
  const haystack = `${item.actor.name} ${item.action} ${item.context.name} ${item.detail ?? ''}`.toLowerCase()
  return haystack.includes(query)
}

/** Filter by preset window + type + entity + free text, newest first. */
export function filterActivity(items: ActivityFeedItem[], filters: ActivityFilters): ActivityFeedItem[] {
  const cutoff = presetCutoff(filters.preset)
  const query = filters.search.trim().toLowerCase()
  return items
    .filter((item) => {
      if (cutoff && parseISO(item.iso) < cutoff) return false
      if (filters.type !== 'all' && item.type !== filters.type) return false
      if (filters.entity !== 'all') {
        const actorId = 'id' in item.actor ? item.actor.id : undefined
        const contextId = 'id' in item.context ? item.context.id : undefined
        if (actorId !== filters.entity && contextId !== filters.entity) return false
      }
      if (query && !matchesSearch(item, query)) return false
      return true
    })
    .sort((a, b) => b.iso.localeCompare(a.iso))
}

export type EntityOption = { id: string; name: string }

/** Distinct named entities present in the feed, split into members and clients. */
export function entityOptions(items: ActivityFeedItem[]): { members: EntityOption[]; clients: EntityOption[] } {
  const members = new Map<string, string>()
  const clients = new Map<string, string>()
  for (const item of items) {
    for (const entity of [item.actor, item.context]) {
      if (entity.kind === 'member') members.set(entity.id, entity.name)
      else if (entity.kind === 'client') clients.set(entity.id, entity.name)
    }
  }
  const toSorted = (map: Map<string, string>): EntityOption[] =>
    [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  return { members: toSorted(members), clients: toSorted(clients) }
}

export type ActivityStats = {
  total: number
  byType: Partial<Record<ActivityType, number>>
  dominantType: ActivityType | null
  topActorName: string | null
}

/** Aggregate counts over an already-filtered set, for the AI insight. */
export function summarizeActivity(items: ActivityFeedItem[]): ActivityStats {
  const byType: Partial<Record<ActivityType, number>> = {}
  const actorCounts = new Map<string, number>()
  for (const item of items) {
    byType[item.type] = (byType[item.type] ?? 0) + 1
    if (item.actor.kind !== 'plain') {
      actorCounts.set(item.actor.name, (actorCounts.get(item.actor.name) ?? 0) + 1)
    }
  }
  let dominantType: ActivityType | null = null
  let dominantCount = 0
  for (const [type, count] of Object.entries(byType) as [ActivityType, number][]) {
    if (count > dominantCount) {
      dominantCount = count
      dominantType = type
    }
  }
  let topActorName: string | null = null
  let topActorCount = 0
  for (const [name, count] of actorCounts) {
    if (count > topActorCount) {
      topActorCount = count
      topActorName = name
    }
  }
  return { total: items.length, byType, dominantType, topActorName }
}
