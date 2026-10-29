import { buildTrailHref, type Crumb } from '@/app/lib/nav-trail'

export const DASHBOARD_CRUMB: Crumb = { label: 'Dashboard', to: '/dashboard' }

export function withDashboardTrail(href: string): string {
  return buildTrailHref(href, DASHBOARD_CRUMB, new URLSearchParams())
}
