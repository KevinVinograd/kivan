import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Badge, Card, CardContent } from '@/app/components/components'
import { FloatingCardCta } from './dashboard-cta'
import { extraKindLabel, extraStatusBadge, formatCurrency } from './employee-dashboard-format'
import type { ExtraItem, ExtrasSummary } from './employee-dashboard-types'

function ExtraCard({ item }: { item: ExtraItem }) {
  const navigate = useNavigate()
  const status = extraStatusBadge(item.status)
  return (
    <Card interactive onClick={() => navigate(item.cta.href)} className="group relative overflow-hidden">
      <CardContent className="flex items-start gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" shape="pill">
              {extraKindLabel(item.kind)}
            </Badge>
            <span className="type-section fg-default">{item.context}</span>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          {item.amount != null ? (
            <span className="type-mono-2 tabular-nums fg-default">{formatCurrency(item.amount)}</span>
          ) : null}
          <span className="type-caption fg-subtle">{item.detail}</span>
        </div>
        <FloatingCardCta href={item.cta.href}>{item.cta.label}</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

export function ExtrasAndExpensesSnapshot({ extras }: { extras: ExtrasSummary }) {
  return (
    <section aria-label="Extras y viáticos" className="flex flex-col">
      <SectionHeader
        title="Extras y viáticos"
        metadata={
          extras.items.length > 0 ? (
            <>
              <span>{extras.extrasPending} extras pendientes</span>
              <span>{extras.extrasDeclared} extras declarados</span>
              <span>{extras.viaticsPending} viáticos pendientes</span>
              <span>{extras.viaticsLoaded} viáticos cargados</span>
            </>
          ) : undefined
        }
      />
      <div className="px-4 md:px-6 lg:pl-8 lg:pr-5 desktop:pl-10">
        {extras.items.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {extras.items.map((item) => (
              <ExtraCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">No tenés extras ni viáticos para este mes.</p>
        )}
      </div>
    </section>
  )
}
