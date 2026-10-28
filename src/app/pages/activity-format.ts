/**
 * Actividad por período — formatting + the dynamic AI-insight sentence.
 *
 * Pure functions that turn the feed model into display values: the leading icon
 * and label per action type, and the deterministic summary headline the page
 * feeds into the `AiInsight` pattern. Every icon is already registered (no new
 * registry entry). Relative/short date formatting is reused from the shared
 * cobranza vocabulary so the whole product speaks one date language. Formatting
 * never lives in the data layer.
 */
import { ICON, type Icon } from '@/app/lib/icon-registry'
import type { ActivityPreset, ActivityStats, ActivityType } from './activity-data'

export { formatRelativeDate, formatShortDate } from './cobranza-format'

// ── Type → icon (all already registered) ──────────────────────────────────────
const TYPE_ICON: Record<ActivityType, Icon> = {
  cobro: ICON.payment,
  horas: ICON.logHours,
  viatico: ICON.expense,
  feedback: ICON.feedback,
  facturacion: ICON.invoice,
  banco: ICON.bankDetails,
  extra: ICON.addExtraWork,
  produccion: ICON.production,
  reunion: ICON.meeting,
}
export function activityTypeIcon(type: ActivityType): Icon {
  return TYPE_ICON[type]
}

// ── Type → label (filter options; single-word, sentence case C2) ──────────────
const TYPE_LABEL: Record<ActivityType, string> = {
  cobro: 'Cobros',
  horas: 'Horas',
  viatico: 'Viáticos',
  feedback: 'Feedback',
  facturacion: 'Facturación',
  banco: 'Banco',
  extra: 'Extras',
  produccion: 'Producciones',
  reunion: 'Reuniones',
}
export function activityTypeLabel(type: ActivityType): string {
  return TYPE_LABEL[type]
}

/** All types in display order, for the type filter options. */
export const ACTIVITY_TYPES: ActivityType[] = [
  'cobro',
  'facturacion',
  'horas',
  'feedback',
  'reunion',
  'produccion',
  'extra',
  'viatico',
  'banco',
]

// ── Dynamic AI insight ─────────────────────────────────────────────────────────
/** Sentence-case period framing for the insight headline (not a label). */
const PERIOD_PHRASE: Record<ActivityPreset, string> = {
  hoy: 'Hoy',
  'last-week': 'En la última semana',
  'last-month': 'En el último mes',
  'last-3-months': 'En los últimos 3 meses',
  all: 'En todo el período',
}

/** Lowercase noun phrase for a dominant type, e.g. "cobros". */
function dominantPhrase(type: ActivityType): string {
  return TYPE_LABEL[type].toLowerCase()
}

export type ActivityInsight = { headline: string }

/**
 * Build the deterministic insight from the filtered stats. Reacts to the active
 * period/filters: count, dominant action and the most active person. Presentational
 * only (no backend, no model call) — the summary the `AiInsight` banner shows.
 */
export function buildActivityInsight(stats: ActivityStats, preset: ActivityPreset): ActivityInsight {
  const period = PERIOD_PHRASE[preset]
  if (stats.total === 0) {
    return { headline: 'No hay actividad en este período con los filtros actuales.' }
  }

  const movimientos = stats.total === 1 ? '1 movimiento' : `${stats.total} movimientos`
  let headline = `${period} se ${stats.total === 1 ? 'registró' : 'registraron'} ${movimientos}`
  if (stats.dominantType) {
    headline += `, con predominio de ${dominantPhrase(stats.dominantType)}`
  }
  headline += '.'
  if (stats.topActorName) {
    headline += ` ${stats.topActorName} concentró la mayor actividad.`
  }
  return { headline }
}
