import type { ColumnDef } from '@tanstack/react-table'

import { cn } from '@/app/lib/utils'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  buttonVariants,
  toast,
} from '@/app/components/components'
import { DataTable } from '@/app/components/patterns'
import type { AlertStatus, MonthlyAlert } from './monthly-operation-mock-data'
import {
  ALERT_STATUS_LABEL,
  ALERT_TYPE_LABEL,
  NO_VALUE,
  alertSeverityBadge,
  alertStatusBadge,
} from './monthly-operation-format'
import { useMonthlyOperation } from './monthly-operation-data'

const SEVERITY_RANK: Record<MonthlyAlert['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 }

function alertColumns(
  onSetStatus: (alert: MonthlyAlert, status: AlertStatus) => void,
  locked: boolean,
): ColumnDef<MonthlyAlert>[] {
  return [
    {
      id: 'severity',
      header: 'Severidad',
      meta: { mobile: 'badge' },
      accessorFn: (a) => SEVERITY_RANK[a.severity],
      cell: ({ row }) => {
        const badge = alertSeverityBadge(row.original.severity)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    {
      id: 'type',
      header: 'Tipo',
      accessorFn: (a) => a.type,
      cell: ({ row }) => <span className="fg-default">{ALERT_TYPE_LABEL[row.original.type]}</span>,
    },
    {
      accessorKey: 'entity',
      id: 'entity',
      header: 'Entidad relacionada',
      meta: { mobile: 'title' },
      cell: ({ row }) => <span className="fg-default">{row.original.entity}</span>,
    },
    {
      accessorKey: 'description',
      id: 'description',
      header: 'Descripción',
      enableSorting: false,
      cell: ({ row }) => <span className="fg-default">{row.original.description}</span>,
    },
    {
      accessorKey: 'responsible',
      id: 'responsible',
      header: 'Responsable',
      cell: ({ row }) => (
        <span className={row.original.responsible ? 'fg-default' : 'fg-subtle'}>
          {row.original.responsible ?? NO_VALUE}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Estado',
      accessorFn: (a) => a.status,
      cell: ({ row }) => {
        const badge = alertStatusBadge(row.original.status)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    {
      id: 'action',
      header: 'Acción',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const alert = row.original
        return (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Cambiar estado de la alerta"
                className={cn(buttonVariants({ variant: 'transparent', color: 'primary' }), 'size-8 shrink-0')}
              >
                <AFFORDANCE.overflow className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(['open', 'in_progress', 'resolved'] as AlertStatus[]).map((status) => (
                  <DropdownMenuItem
                    key={status}
                    disabled={locked || alert.status === status}
                    onSelect={() => onSetStatus(alert, status)}
                  >
                    {ALERT_STATUS_LABEL[status]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}

/** Alertas tab — actionable monthly alerts with status changes. */
export function AlertsTab() {
  const op = useMonthlyOperation()
  const columns = alertColumns(async (alert, status) => {
    if (!(await op.setAlertStatus(alert.id, status))) return
    toast.success(`Alerta marcada como ${ALERT_STATUS_LABEL[status].toLowerCase()}`)
  }, op.locked)

  return (
    <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
      <DataTable
        columns={columns}
        data={op.data.alerts}
        pageSize={25}
        getRowId={(alert) => alert.id}
        emptyState={() => <span>No hay alertas este mes</span>}
      />
    </div>
  )
}
