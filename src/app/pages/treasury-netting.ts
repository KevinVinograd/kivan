import { addMonths, isBefore, isSameISOWeek, parseISO, startOfMonth } from 'date-fns'

import type { CashflowLine, DatedLine, EntityRef } from './treasury-format'
import type { CommittedItem } from './treasury-mock-data'

export type PoolLine = { at: Date; remaining: number }

export type Occurrence = { item: CommittedItem; at: Date; idx: number }

const NOTHING_LEFT = 0.005

export function dedupCategory(category: CashflowLine['category']): string {
  return category === 'retainer' ? 'collection' : category
}

function entityKey(direction: CashflowLine['direction'], entity: EntityRef): string {
  return `${direction}|${entity.type}|${entity.id}`
}

function categoryKey(direction: CashflowLine['direction'], category: CashflowLine['category']): string {
  return `${direction}|${dedupCategory(category)}`
}

const REALIZATION_SPAN_MONTHS = { monthly: 1, quarterly: 3, annual: 12, one_time: 1 } as const

export function realizes(moneyAt: Date, occ: Occurrence): boolean {
  if (isSameISOWeek(moneyAt, occ.at)) return true
  const from = startOfMonth(occ.at)
  const to = addMonths(from, REALIZATION_SPAN_MONTHS[occ.item.recurrence])
  return !isBefore(moneyAt, from) && isBefore(moneyAt, to)
}

export function buildPool(
  lines: DatedLine[],
  isInWindow: (dateISO: string) => boolean,
): { byEntity: Map<string, PoolLine[]>; byCategory: Map<string, PoolLine[]> } {
  const byEntity = new Map<string, PoolLine[]>()
  const byCategory = new Map<string, PoolLine[]>()
  const push = (map: Map<string, PoolLine[]>, key: string, line: PoolLine) => {
    const bucket = map.get(key)
    if (bucket) bucket.push(line)
    else map.set(key, [line])
  }

  for (const line of lines) {
    if (line.basis !== 'actual' && !isInWindow(line.date)) continue
    const entry: PoolLine = { at: parseISO(line.date), remaining: line.amount }
    if (line.entity) push(byEntity, entityKey(line.direction, line.entity), entry)
    push(byCategory, categoryKey(line.direction, line.category), entry)
  }

  const byDate = (a: PoolLine, b: PoolLine) => a.at.getTime() - b.at.getTime()
  for (const bucket of byEntity.values()) bucket.sort(byDate)
  for (const bucket of byCategory.values()) bucket.sort(byDate)
  return { byEntity, byCategory }
}

export function isLinked(item: CommittedItem): boolean {
  return Boolean(item.linkedEntityType && item.linkedEntityId)
}

export function claim(
  occ: Occurrence,
  pool: { byEntity: Map<string, PoolLine[]>; byCategory: Map<string, PoolLine[]> },
  onlyEntity: boolean,
): number {
  const { item } = occ
  const bucket = onlyEntity
    ? (pool.byEntity.get(entityKey(item.direction, {
        type: item.linkedEntityType!,
        id: item.linkedEntityId!,
      })) ?? [])
    : (pool.byCategory.get(categoryKey(item.direction, item.category)) ?? [])

  let needed = item.amount
  for (const line of bucket) {
    if (needed < NOTHING_LEFT) break
    if (line.remaining < NOTHING_LEFT) continue
    if (!realizes(line.at, occ)) continue
    const taken = Math.min(line.remaining, needed)
    line.remaining -= taken
    needed -= taken
  }
  return needed < NOTHING_LEFT ? 0 : needed
}
