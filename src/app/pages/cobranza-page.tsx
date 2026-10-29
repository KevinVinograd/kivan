import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { PageHeader, PageContent } from '@/app/components/templates'
import { useRole } from '@/app/lib/use-role'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TooltipProvider,
} from '@/app/components/components'
import { AFFORDANCE, ICON } from '@/app/lib/icon-registry'
import { cn } from '@/app/lib/utils'
import { motionClass } from '@/app/lib/motion'
import { useIsBelowDesktop } from '@/app/lib/use-is-mobile'
import { useHeaderOffset } from '@/app/lib/use-header-offset'
import { trailToHere } from '@/app/lib/nav-trail'
import { formatMonthYear } from './cobranza-format'
import { cobranzaPeriods, currentCobranzaPeriod, type CobranzaPeriod } from './cobranza-periods'
import { readPeriodParam } from '@/app/lib/periods'
import { CobranzaError, CobranzaLoading } from './cobranza-states'
import { useReceivables } from './receivables-data'
import { usePayments } from './payments-data'
import { CobrosTab } from './cobros-tab'
import { PagosTab } from './pagos-tab'

type LoadStatus = 'loading' | 'ready' | 'error'
type FinanceKind = 'cobros' | 'pagos'

const PAGE_CONFIG: Record<FinanceKind, { title: string; description: string; actionLabel: string }> = {
  cobros: {
    title: 'Cobros',
    description: 'Gestioná los cobros a clientes y su facturación del mes.',
    actionLabel: 'Nuevo cobro',
  },
  pagos: {
    title: 'Pagos',
    description: 'Gestioná los pagos al equipo y a proveedores del mes.',
    actionLabel: 'Nuevo pago',
  },
}

function FinancePeriodControls({
  selectedPeriod,
  periods,
  onSelectPeriod,
}: {
  selectedPeriod: CobranzaPeriod
  periods: CobranzaPeriod[]
  onSelectPeriod: (period: CobranzaPeriod) => void
}) {
  return (
    <Select value={selectedPeriod} onValueChange={(value) => onSelectPeriod(value as CobranzaPeriod)}>
      <SelectTrigger aria-label="Seleccionar período">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {periods.map((period) => (
          <SelectItem key={period} value={period}>
            {formatMonthYear(period)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function FinanceModulePage({ kind }: { kind: FinanceKind }) {
  const config = PAGE_CONFIG[kind]
  const { canDo } = useRole()
  const [searchParams] = useSearchParams()
  const deepLinkOpen = searchParams.get('open')
  const deepLinkPeriod = searchParams.get('period')
  const initialPeriod: CobranzaPeriod = readPeriodParam(deepLinkPeriod) ?? currentCobranzaPeriod()
  const trail = trailToHere(searchParams, `/${kind}`)

  const [selectedId, setSelectedId] = useState<string | null>(deepLinkOpen ?? null)
  const [selectedPeriod, setSelectedPeriod] = useState<CobranzaPeriod>(initialPeriod)
  const [createOpen, setCreateOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)

  const receivables = useReceivables()
  const payments = usePayments()

  const status: LoadStatus =
    kind === 'cobros'
      ? receivables.isFetching
        ? 'loading'
        : receivables.isError
          ? 'error'
          : 'ready'
      : payments.isLoading
        ? 'loading'
        : payments.isError
          ? 'error'
          : 'ready'

  const belowDesktop = useIsBelowDesktop()
  const inDetail = status === 'ready' && selectedId !== null
  const closeDetail = () => setSelectedId(null)

  const [mode, setMode] = useState<'table' | 'split'>('table')
  const [headerRef, regionRef] = useHeaderOffset<HTMLDivElement, HTMLDivElement>()
  const dissolved = status === 'ready' && (inDetail || mode === 'split') && !belowDesktop
  const headerDissolved = inDetail && !belowDesktop

  useEffect(() => {
    if (status !== 'ready') setMode('table')
  }, [status])

  const breadcrumbNode = trail.length > 0 ? (
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
          <BreadcrumbPage>{config.title}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  ) : null

  const onSelect = useCallback((id: string) => setSelectedId((prev) => (prev === id ? null : id)), [])

  const periods = useMemo(
    () =>
      cobranzaPeriods(
        kind === 'cobros'
          ? receivables.receivables.map((row) => row.period)
          : payments.payments.map((row) => row.period),
      ),
    [kind, receivables.receivables, payments.payments],
  )

  const periodControl = (
    <FinancePeriodControls selectedPeriod={selectedPeriod} periods={periods} onSelectPeriod={setSelectedPeriod} />
  )

  let body
  if (status === 'loading') {
    body = <CobranzaLoading storageKey={kind} />
  } else if (status === 'error') {
    body = (
      <CobranzaError
        onRetry={kind === 'cobros' ? () => receivables.refetch() : () => payments.refetch()}
      />
    )
  } else if (kind === 'cobros') {
    body = (
      <CobrosTab
        selectedPeriod={selectedPeriod}
        selectedId={selectedId}
        onSelect={onSelect}
        onClose={closeDetail}
        inDetail={inDetail}
        breadcrumb={breadcrumbNode}
        periodControl={periodControl}
        createOpen={createOpen}
        onCloseCreate={() => setCreateOpen(false)}
        generateOpen={generateOpen}
        onCloseGenerate={() => setGenerateOpen(false)}
        onModeChange={setMode}
        dissolved={dissolved}
      />
    )
  } else {
    body = (
      <PagosTab
        selectedPeriod={selectedPeriod}
        selectedId={selectedId}
        onSelect={onSelect}
        onClose={closeDetail}
        inDetail={inDetail}
        breadcrumb={breadcrumbNode}
        periodControl={periodControl}
        createOpen={createOpen}
        onCloseCreate={() => setCreateOpen(false)}
        onModeChange={setMode}
        dissolved={dissolved}
      />
    )
  }

  return (
    <TooltipProvider>
      <div ref={regionRef} className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={headerRef}
          className={cn(motionClass('content-dissolve'), dissolved && 'pointer-events-none')}
          data-dissolved={headerDissolved ? 'true' : undefined}
          inert={dissolved ? '' : undefined}
        >
          <PageHeader
            eyebrow="Hold"
            eyebrowHidden
            breadcrumb={breadcrumbNode ?? undefined}
            title={config.title}
            description={config.description}
            controls={
              status === 'ready' ? (
                <FinancePeriodControls selectedPeriod={selectedPeriod} periods={periods} onSelectPeriod={setSelectedPeriod} />
              ) : undefined
            }
            actions={
              status === 'ready'
                ? [
                    ...(kind === 'cobros' && canDo('receivable.generate')
                      ? [
                          {
                            key: 'generate',
                            label: 'Generar cobros del mes',
                            icon: ICON.recurringBilling,
                            variant: 'outlined' as const,
                            leadingIcon: true,
                            mobileIconOnly: true,
                            onClick: () => setGenerateOpen(true),
                          },
                        ]
                      : []),
                    ...(canDo(kind === 'cobros' ? 'receivable.create' : 'payment.create')
                      ? [
                          {
                            key: 'create',
                            label: PAGE_CONFIG[kind].actionLabel,
                            icon: AFFORDANCE.create,
                            variant: 'solid' as const,
                            leadingIcon: true,
                            mobileIconOnly: true,
                            primary: true,
                            onClick: () => setCreateOpen(true),
                          },
                        ]
                      : []),
                  ]
                : undefined
            }
          />
        </div>
        <div className={cn('flex min-h-0 flex-col', dissolved ? 'absolute inset-0' : 'flex-1')}>
          <PageContent>{body}</PageContent>
        </div>
      </div>
    </TooltipProvider>
  )
}

export function CobrosPage() {
  return <FinanceModulePage kind="cobros" />
}

export function PagosPage() {
  return <FinanceModulePage kind="pagos" />
}
