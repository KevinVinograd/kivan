import { useState } from 'react'

import { cn } from '@/app/lib/utils'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/components'
import type { CierreFigure, CloseBlocker } from './monthly-operation-format'

const FIGURE_TONE_FG: Record<'default' | 'success' | 'danger', string> = {
  default: 'fg-default',
  success: 'fg-success',
  danger: 'fg-danger',
}

export function CloseMonthDialog({
  monthLabel,
  figures,
  blockers,
  onClose,
  onConfirm,
}: {
  monthLabel: string
  figures: CierreFigure[]
  blockers: CloseBlocker[]
  onClose: () => void
  onConfirm: () => void
}) {
  const [acknowledged, setAcknowledged] = useState(false)
  const hasBlockers = blockers.length > 0

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cerrar operación de {monthLabel}</DialogTitle>
          <DialogDescription>
            Al cerrar el mes, se bloquearán los cálculos y se guardará una copia histórica de clientes,
            equipo, cobros, pagos, producciones, gastos y rentabilidad. Podés reabrirlo más adelante, pero
            quedará registrado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {figures.map((figure) => (
            <div key={figure.label} className="flex flex-col gap-1">
              <span className="type-caption fg-subtle">{figure.label}</span>
              <span className={cn('type-body tabular-nums', FIGURE_TONE_FG[figure.tone ?? 'default'])}>
                {figure.value}
              </span>
            </div>
          ))}
        </div>

        {hasBlockers ? (
          <Alert variant="danger">
            <AlertTitle>No se puede cerrar todavía</AlertTitle>
            <AlertDescription>
              {blockers.map((blocker) => (
                <span key={blocker.id}>
                  {blocker.label}: {blocker.items.join(', ')}
                </span>
              ))}
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="success">
            <AlertTitle>Sin validaciones pendientes</AlertTitle>
            <AlertDescription>
              <span>El mes está en condiciones de cerrarse.</span>
            </AlertDescription>
          </Alert>
        )}

        {!hasBlockers ? (
          <label className="flex items-center gap-2 type-body-2 fg-default">
            <Checkbox checked={acknowledged} onCheckedChange={(checked) => setAcknowledged(!!checked)} />
            Entiendo que el mes quedará bloqueado.
          </label>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outlined" color="primary">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            variant="solid"
            color="primary"
            disabled={hasBlockers || !acknowledged}
            onClick={onConfirm}
          >
            Cerrar mes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
