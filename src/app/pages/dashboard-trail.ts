import { buildTrailHref, type Crumb } from '@/app/lib/nav-trail'

/**
 * Shared dashboard back-trail. Every dashboard CTA / alert / header control seeds
 * the SAME crumb so a destination can render a "Dashboard → …" return path. The
 * dashboards are the trail ROOT, so there is no inbound trail to forward. Keeping
 * the crumb and the root-trail builder in one place means a relabel of "Dashboard"
 * or a reroute of `/dashboard` is a single edit, not a lockstep change across every
 * dashboard data/control file.
 */
export const DASHBOARD_CRUMB: Crumb = { label: 'Dashboard', to: '/dashboard' }

/** A deep-link href that carries the Dashboard back-trail (root: empty inbound trail). */
export function withDashboardTrail(href: string): string {
  return buildTrailHref(href, DASHBOARD_CRUMB, new URLSearchParams())
}
