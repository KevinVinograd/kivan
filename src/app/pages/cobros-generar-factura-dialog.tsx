import { useMemo, useState } from 'react'

import { cn } from '@/app/lib/utils'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
  toast,
} from '@/app/components/components'
import { ApiError } from '@/api/client'
import { formatCurrency, formatMoney, formatMonthYear, formatShortDate, NO_REGISTRO } from './cobranza-format'
import { DetailRow } from './cobranza-detail-ui'
import { EMITTER_ALERT_BADGE, EMITTER_ALERT_TONE, invoiceReadiness } from './cobros-invoice'
import { blocks, emitterFor, useInvoiceEmitters, type RealEmitter } from './emitters-api-data'
import type { Receivable } from './cobros-mock-data'

type Step = 'review' | 'emitter' | 'confirm'

/** Selectable emisor card (§9.5): name, CUIT/PV, estado, nivel de uso. */
function EmitterOption({
  emitter,
  selected,
  onSelect,
}: {
  emitter: RealEmitter
  selected: boolean
  onSelect: (emitter: RealEmitter) => void
}) {
  const badge = EMITTER_ALERT_BADGE[emitter.alert]
  // Usage % from the emisor's real numbers; no declared ceiling → 0 (never "full").
  const pct = emitter.monthlyLimit > 0 ? Math.round((emitter.monthlyUsed / emitter.monthlyLimit) * 100) : 0
  return (
    <button
      type="button"
      onClick={() => onSelect(emitter)}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-2 rounded-control border p-3 text-left motion-standard',
        selected
          ? 'border-alpha-emphasis bg-alpha-subtle-selected'
          : 'border-alpha-subtle hover:bg-alpha-subtle-hover',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 type-button fg-default">
          {selected ? <AFFORDANCE.selected className="size-4 fg-primary" aria-hidden /> : null}
          {emitter.label}
        </span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <span className="type-caption fg-subtle">
        CUIT {emitter.cuit} · Punto de venta {emitter.puntoDeVenta}
      </span>
      <Progress value={pct} tone={EMITTER_ALERT_TONE[emitter.alert]} />
      <span className="type-caption fg-subtle tabular-nums">
        {emitter.monthlyLimit > 0
          ? `Uso mensual ${formatCurrency(emitter.monthlyUsed)} de ${formatCurrency(emitter.monthlyLimit)} (${pct}%)`
          : `Uso mensual ${formatCurrency(emitter.monthlyUsed)} · sin tope declarado`}
      </span>
    </button>
  )
}

/**
 * What the operator is told when generating a factura fails.
 *
 * The bare `catch {}` this replaces discarded every server refusal for one generic
 * sentence, so an emisor the dialog had just badged `Disponible` could 409 on a cap no
 * screen ever showed and the operator learned only that it did not work — the defect WF004
 * ratchets against.
 *
 * But forwarding `error.message` verbatim is not the fix either: the API speaks English and
 * some of its messages carry an internal id (`Invoice emitter <uuid> not found`), so the
 * operator would read a raw UUID on a Spanish screen. The two refusals that are ACTIONABLE
 * get a Spanish sentence each; everything else keeps the generic one, which loses nothing
 * the operator could have acted on.
 */
function generateErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return 'No se pudo generar la factura'
  }
  const message = error.message ?? ''
  if (/comprobante/i.test(message)) {
    return 'Este cobro no está en pesos y el monotributo tiene un tope en pesos, así que el comprobante no se puede contar contra el cupo. Emitilo desde un emisor sin tope.'
  }
  if (/quota/i.test(message)) {
    return 'El monotributo llegaría a su tope con esta factura. Elegí otro emisor o revisá el cupo.'
  }
  return 'No se pudo generar la factura'
}

/**
 * Generar factura (§9.6) — a three-step flow inside one Dialog: revisar la
 * información, seleccionar el monotributo emisor (§9.5) y confirmar. Generation calls
 * the real endpoint (POST /receivables/:id/invoice/generate) through `onGenerate`, which
 * reserves emisor quota and allocates the comprobante sequence server-side. A blocking
 * emisor (límite alcanzado / error de conexión) stops the step, a near limit only warns
 * (§9.5 product rule). Missing fiscal data (§9.4) blocks step 1.
 */
export function CobrosGenerarFacturaDialog({
  receivable,
  onGenerate,
  onClose,
  onEditFiscalData,
}: {
  receivable: Receivable
  /** Issue the comprobante through the real endpoint. Resolves on success, rejects on failure. */
  onGenerate: (receivableId: string, emitterId: string) => Promise<void>
  onClose: () => void
  onEditFiscalData: (receivable: Receivable) => void
}) {
  const readiness = invoiceReadiness(receivable)
  // The store owns the emisores read + its error gate (SE001): a failed fetch must not read
  // as "no monotributos" on a money surface, so the emitter step surfaces it with a retry.
  const { emitters, isLoading: emittersLoading, isError: emittersFailed, refetch } = useInvoiceEmitters()
  const [step, setStep] = useState<Step>('review')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  // The selected emisor: the user's pick, else the receivable's own profile when it can still
  // issue, else the first that can, else the first — recomputed as the async list resolves.
  const emitter = useMemo<RealEmitter | null>(() => {
    const picked = selectedId ? emitters.find((e) => e.id === selectedId) : undefined
    return picked ?? emitterFor(emitters, receivable.taxProfileId) ?? emitters[0] ?? null
  }, [selectedId, emitters, receivable.taxProfileId])
  const setEmitter = (next: RealEmitter) => setSelectedId(next.id)
  const blocked = emitter ? blocks(emitter.alert) : true

  async function handleGenerate() {
    if (!emitter) return
    setGenerating(true)
    try {
      await onGenerate(receivable.id, emitter.id)
    } catch (error) {
      toast.error(generateErrorMessage(error))
      setGenerating(false)
      return
    }
    toast.success('Factura generada')
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generar factura</DialogTitle>
          <DialogDescription>
            {receivable.clientName} · {formatMonthYear(receivable.period)} ·{' '}
            {formatMoney(receivable.totalAmount, receivable.currency)}
          </DialogDescription>
        </DialogHeader>

        {step === 'review' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <DetailRow label="Cliente" value={receivable.clientName} />
              <DetailRow label="Razón social" value={receivable.businessName ?? NO_REGISTRO} />
              <DetailRow label="CUIT" value={receivable.taxId ?? NO_REGISTRO} />
              <DetailRow label="Período" value={formatMonthYear(receivable.period)} />
              <DetailRow label="Servicio" value={receivable.service} />
              <DetailRow
                label="Monto"
                value={formatMoney(receivable.totalAmount, receivable.currency)}
              />
              <DetailRow label="Vencimiento" value={formatShortDate(receivable.dueDate)} />
              <DetailRow label="Monotributo sugerido" value={emitter?.label ?? NO_REGISTRO} />
            </div>
            {!readiness.ready ? (
              <Alert
                variant="danger"
                action={
                  <Button
                    variant="outlined"
                    color="primary"
                    size="dense"
                    onClick={() => onEditFiscalData(receivable)}
                  >
                    Completar datos
                  </Button>
                }
              >
                <AlertTitle>No se puede generar la factura</AlertTitle>
                <AlertDescription>Faltan datos fiscales: {readiness.missing.join(', ')}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}

        {step === 'emitter' ? (
          <div className="flex flex-col gap-3">
            <p className="type-body-2 fg-subtle">Seleccioná el monotributo desde el que se factura.</p>
            <div className="flex flex-col gap-2">
              {emitters.map((option) => (
                <EmitterOption
                  key={option.id}
                  emitter={option}
                  selected={option.id === emitter?.id}
                  onSelect={setEmitter}
                />
              ))}
            </div>
            {emittersFailed ? (
              <Alert
                variant="danger"
                action={
                  <Button variant="outlined" color="primary" size="dense" onClick={() => refetch()}>
                    Reintentar
                  </Button>
                }
              >
                <AlertTitle>No se pudieron cargar los monotributos</AlertTitle>
                <AlertDescription>Reintentá para elegir un emisor.</AlertDescription>
              </Alert>
            ) : emittersLoading ? (
              <p className="type-body-2 fg-subtle">Cargando monotributos…</p>
            ) : emitters.length === 0 ? (
              <Alert variant="danger">
                <AlertTitle>No hay monotributos disponibles</AlertTitle>
                <AlertDescription>
                  Configurá al menos un emisor conectado para poder facturar.
                </AlertDescription>
              </Alert>
            ) : blocked && emitter ? (
              <Alert variant="danger">
                <AlertTitle>Este monotributo no puede facturar</AlertTitle>
                <AlertDescription>
                  {EMITTER_ALERT_BADGE[emitter.alert].label}. Elegí otro emisor para continuar.
                </AlertDescription>
              </Alert>
            ) : emitter?.alert === 'cerca_limite' ? (
              <Alert variant="warning">
                <AlertTitle>El monotributo está cerca del límite</AlertTitle>
                <AlertDescription>Podés continuar, pero revisá el uso acumulado del mes.</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}

        {step === 'confirm' && emitter ? (
          <div className="flex flex-col gap-3">
            <p className="type-body-2 fg-default">
              Vas a generar una factura por{' '}
              {formatMoney(receivable.totalAmount, receivable.currency)} para{' '}
              {receivable.clientName} desde{' '}
              {emitter.label}.
            </p>
            <div className="flex flex-col gap-1.5">
              <DetailRow
                label="Monto"
                value={formatMoney(receivable.totalAmount, receivable.currency)}
              />
              <DetailRow label="Cliente" value={receivable.clientName} />
              <DetailRow label="Monotributo" value={emitter.label} />
              <DetailRow label="Punto de venta" value={emitter.puntoDeVenta} />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {step === 'review' ? (
            <>
              <Button variant="outlined" color="primary" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                variant="solid"
                color="primary"
                disabled={!readiness.ready}
                onClick={() => setStep('emitter')}
              >
                Continuar
              </Button>
            </>
          ) : null}
          {step === 'emitter' ? (
            <>
              <Button variant="outlined" color="primary" onClick={() => setStep('review')}>
                Atrás
              </Button>
              <Button
                variant="solid"
                color="primary"
                disabled={blocked || !emitter}
                onClick={() => setStep('confirm')}
              >
                Continuar
              </Button>
            </>
          ) : null}
          {step === 'confirm' ? (
            <>
              <Button
                variant="outlined"
                color="primary"
                disabled={generating}
                onClick={() => setStep('emitter')}
              >
                Atrás
              </Button>
              <Button
                variant="solid"
                color="primary"
                disabled={generating || !emitter}
                data-loading={generating ? 'true' : undefined}
                onClick={handleGenerate}
              >
                {generating ? 'Generando…' : 'Confirmar y generar'}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
