import type { Crumb } from '@/app/lib/nav-trail'

/**
 * Shared Reportes back-trail crumbs, one per tab. Every outbound deep-link from a
 * Reportes tab (row actions + detail-panel CTAs) seeds the crumb for its own tab so
 * the destination can render a "Reportes → …" return path. Defined once here — not
 * re-declared in each tab AND its paired detail — so a tab-slug change is a single
 * edit and the tab and its detail can never drift to different slugs.
 */
export const RESUMEN_CRUMB: Crumb = { label: 'Reportes', to: '/reports?tab=resumen' }
export const PRODUCTIVIDAD_CRUMB: Crumb = { label: 'Reportes', to: '/reports?tab=productividad' }
export const RENTABILIDAD_CRUMB: Crumb = { label: 'Reportes', to: '/reports?tab=rentabilidad' }
export const CARGA_CRUMB: Crumb = { label: 'Reportes', to: '/reports?tab=carga' }
export const FINANZAS_CRUMB: Crumb = { label: 'Reportes', to: '/reports?tab=finanzas' }
