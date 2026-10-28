import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/app/components/components'
import type { Crumb } from '@/app/lib/nav-trail'

/**
 * Contextual back-trail breadcrumb — the page-domain composition of the Breadcrumb
 * primitive shared by every deep-linkable destination. Given the trail the user
 * passed through (`trail`, from `trailToHere`) and the current page's own title
 * (`leaf`), it renders each crumb as an SPA `Link` plus the leaf as the
 * non-interactive current-page marker. Returns `null` for an empty trail so a page
 * reached without a parent context (direct nav / SideNav) shows no breadcrumb.
 *
 * This is the single builder behind the `PageHeader`/`SectionHeader` `breadcrumb`
 * slots and the `MasterDetailLayout` `mobileStepHeader`, so the trail mapping lives
 * in one place instead of being re-inlined per page. It composes the approved
 * Breadcrumb family and is page-domain
 * code (under `src/app/pages/`), not a governed design-system primitive.
 */
export function TrailBreadcrumb({
  trail,
  leaf,
}: {
  trail: Crumb[]
  leaf: string
}): ReactNode {
  if (trail.length === 0) return null
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {trail.map((crumb, index) => (
          <Fragment key={`${crumb.to}-${index}`}>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={crumb.to}>{crumb.label}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{leaf}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
