/**
 * Employee Dashboard — navigation targets for the section/item CTAs.
 *
 * The employee perspective is read-only and route-locked out of Operación mensual,
 * so per-record CTAs point at the employee's own read-only profile on /team (their
 * hours, carga, producciones, viáticos and extras live under `?tab=trabajo`), and
 * client CTAs deep-link into Clientes. The dashboard is the trail root, so each href
 * bakes a back-trail crumb to the dashboard (`new URLSearchParams()` — no inbound
 * trail to forward).
 */
import { buildTrailHref } from '@/app/lib/nav-trail'

import { DASHBOARD_CRUMB } from './dashboard-trail'

const SELF_CARGA_HREF = buildTrailHref('/team?tab=trabajo', DASHBOARD_CRUMB, new URLSearchParams())
// TODO: filter Clientes to "asignados a mí" once that filter exists.
const CLIENTS_HREF = '/clients'
function clientHref(clientId: string): string {
  return buildTrailHref(`/clients?open=${clientId}`, DASHBOARD_CRUMB, new URLSearchParams())
}

export { SELF_CARGA_HREF, CLIENTS_HREF, clientHref }
