import { buildTrailHref } from '@/app/lib/nav-trail'

import { DASHBOARD_CRUMB } from './dashboard-trail'

const SELF_CARGA_HREF = buildTrailHref('/team?tab=trabajo', DASHBOARD_CRUMB, new URLSearchParams())
const CLIENTS_HREF = '/clients'
function clientHref(clientId: string): string {
  return buildTrailHref(`/clients?open=${clientId}`, DASHBOARD_CRUMB, new URLSearchParams())
}

export { SELF_CARGA_HREF, CLIENTS_HREF, clientHref }
