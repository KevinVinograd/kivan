import { parseISO } from 'date-fns'

import type { Role } from '@/app/lib/use-role'

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

export type ActivityEntity =
  | { kind: 'client'; id: string; name: string }
  | { kind: 'member'; id: string; name: string; role: string }
  | { kind: 'plain'; name: string }

export type ActivityFeedItem = {
  id: string
  type: ActivityType
  actor: ActivityEntity
  action: string
  context: ActivityEntity
  iso: string
  detail?: string
}

export type ActivityPreset = 'hoy' | 'last-week' | 'last-month' | 'last-3-months' | 'all'

export const ACTIVITY_PRESETS: { value: ActivityPreset; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'last-week', label: 'Última semana' },
  { value: 'last-month', label: 'Último mes' },
  { value: 'last-3-months', label: 'Últimos 3 meses' },
  { value: 'all', label: 'Todo' },
]

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

export function getActivityFeed(_role: Role): ActivityFeedItem[] {
  return []
}

export type ActivityFilters = {
  search: string
  type: ActivityType | 'all'
  entity: string | 'all'
  preset: ActivityPreset
}

function matchesSearch(item: ActivityFeedItem, query: string): boolean {
  const haystack = `${item.actor.name} ${item.action} ${item.context.name} ${item.detail ?? ''}`.toLowerCase()
  return haystack.includes(query)
}

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
