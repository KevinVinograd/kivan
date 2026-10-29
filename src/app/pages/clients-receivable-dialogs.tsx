import { useState } from 'react'
import { Link } from 'react-router'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/components'
import type { Receivable } from './cobros-mock-data'
import type { Client } from './clients-mock-data'
import { formatCurrency } from './clients-format'
import { byEmitter, type BulkInvoicePlan } from './clients-invoice-plan'
import { emitterFor, type RealEmitter } from './emitters-api-data'
import { CobrosRegistrarCobroDialog } from './cobros-registrar-cobro-dialog'
import { ClientAddExtraWorkDialog } from './clients-action-dialogs'

export function ClientReceivablePicker({
  client,
  receivables,
  title,
  description,
  onPick,
  onClose,
}: {
  client: Client
  receivables: Receivable[]
  title: string
  description: string
  onPick: (receivable: Receivable) => void
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {client.name} · {description}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {receivables.map((receivable) => {
            const outstanding = Math.max(receivable.totalAmount - receivable.collectedAmount, 0)
            return (
              <li key={receivable.id}>
                <Button
                  variant="outlined"
                  color="primary"
                  fullWidth
                  onClick={() => onPick(receivable)}
                  className="justify-between"
                >
                  <span className="type-button fg-default">{receivable.service}</span>
                  <span className="type-body-2 tabular-nums fg-subtle">
                    {formatCurrency(receivable.totalAmount)}
                    {outstanding > 0 && outstanding !== receivable.totalAmount
                      ? ` · resta ${formatCurrency(outstanding)}`
                      : ''}
                  </span>
                </Button>
              </li>
            )
          })}
        </ul>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outlined" color="primary">
              Cancelar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function NoReceivableDialog({
  client,
  action,
  failed,
  onRetry,
  onClose,
}: {
  client: Client
  action: string
  failed: boolean
  onRetry: () => void
  onClose: () => void
}) {
  return (
    <AlertDialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {failed ? 'No se pudieron cargar los cobros' : 'Sin cobro este mes'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {failed
              ? `No pudimos leer los cobros, así que no sabemos qué se le facturó a ${client.name}. Volvé a intentar.`
              : `${client.name} no tiene ningún cobro cargado este mes, así que no hay nada sobre lo que ${action}. Los cobros se crean en Cobros.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cerrar</AlertDialogCancel>
          {failed ? (
            <AlertDialogAction color="primary" onClick={onRetry}>
              Reintentar
            </AlertDialogAction>
          ) : (
            <AlertDialogAction color="primary" asChild>
              <Link to="/cobros">Ir a Cobros</Link>
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function BulkInvoicePlanDialog({
  plan,
  pending,
  onConfirm,
  onClose,
}: {
  plan: BulkInvoicePlan
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const groups = byEmitter(plan)
  const total = plan.issuable.length
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generar facturas</DialogTitle>
          <DialogDescription>
            {total === 0
              ? 'Ninguno de los cobros seleccionados se puede facturar.'
              : total === 1
                ? 'Se va a generar 1 factura.'
                : `Se van a generar ${total} facturas.`}
          </DialogDescription>
        </DialogHeader>

        {groups.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {groups.map(({ emitter, count }) => (
              <li key={emitter.id} className="flex items-center justify-between gap-3">
                <span className="type-body-2 fg-default">
                  {emitter.label}
                  <span className="fg-subtle"> · {emitter.cuit}</span>
                </span>
                <span className="type-body-2 tabular-nums fg-default">
                  {count === 1 ? '1 factura' : `${count} facturas`}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {plan.blocked.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="warning">
                {plan.blocked.length === 1 ? '1 sin emitir' : `${plan.blocked.length} sin emitir`}
              </Badge>
            </div>
            <ul className="flex flex-col gap-1">
              {plan.blocked.map(({ client, receivable, reason }) => (
                <li key={receivable.id} className="type-caption fg-subtle">
                  {client.name} · {receivable.service} — {reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outlined" color="primary" disabled={pending}>
              Cancelar
            </Button>
          </DialogClose>
          <Button
            variant="solid"
            color="primary"
            disabled={pending || total === 0}
            onClick={onConfirm}
          >
            {total === 1 ? 'Generar factura' : `Generar ${total} facturas`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ClientGenerateInvoiceDialog({
  client,
  receivable,
  emitter,
  emittersFailed,
  pending,
  onConfirm,
  onClose,
}: {
  client: Client
  receivable: Receivable
  emitter: RealEmitter | undefined
  emittersFailed: boolean
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const usage =
    emitter && emitter.monthlyLimit > 0
      ? `${formatCurrency(emitter.monthlyUsed)} de ${formatCurrency(emitter.monthlyLimit)} emitidos este mes`
      : null
  return (
    <AlertDialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {emittersFailed ? 'No se pudieron cargar los monotributos' : 'Generar factura'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {emittersFailed ? (
              <>
                No pudimos leer los emisores, así que no sabemos desde cuál emitir. Volvé a
                intentar.
              </>
            ) : emitter ? (
              <>
                {client.name} · {receivable.service} · {formatCurrency(receivable.totalAmount)}. Se
                emite desde {emitter.label} ({emitter.cuit}).
                {usage ? ` ${usage}.` : ''}
              </>
            ) : (
              <>
                Ningún monotributo puede emitir en este momento (límite alcanzado o sin conexión).
                Revisá los emisores en Facturación antes de reintentar.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={pending}>
            {emitter ? 'Cancelar' : 'Cerrar'}
          </AlertDialogCancel>
          {emitter && !emittersFailed ? (
            <AlertDialogAction
              color="primary"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault()
                onConfirm()
              }}
            >
              Generar
            </AlertDialogAction>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export type ClientMoneyDialogState =
  | { kind: 'none' }
  | { kind: 'pickCollect'; client: Client; receivables: Receivable[] }
  | { kind: 'pickInvoice'; client: Client; receivables: Receivable[] }
  | { kind: 'pickExtra'; client: Client; receivables: Receivable[] }
  | { kind: 'collect'; client: Client; receivable: Receivable }
  | { kind: 'invoice'; client: Client; receivable: Receivable }
  | { kind: 'extra'; client: Client; receivable: Receivable }
  | { kind: 'noReceivable'; client: Client; action: string }

export function useMoneyDialog() {
  return useState<ClientMoneyDialogState>({ kind: 'none' })
}

export function ClientMoneyDialogs({
  state,
  emitters,
  emittersFailed,
  receivablesFailed,
  onPick,
  onCollect,
  onAddExtra,
  onGenerateInvoice,
  onRetry,
  onClose,
}: {
  state: ClientMoneyDialogState
  emitters: RealEmitter[]
  emittersFailed: boolean
  receivablesFailed: boolean
  onPick: (kind: 'collect' | 'invoice' | 'extra', client: Client, receivable: Receivable) => void
  onCollect: (
    receivableId: string,
    amount: number,
    collectedAt: string,
    treasuryAccountId?: string,
  ) => Promise<void>
  onAddExtra: (receivable: Receivable, input: { description: string; amount: number }) => Promise<void>
  onGenerateInvoice: (receivable: Receivable, emitter: RealEmitter) => Promise<void>
  onRetry: () => void
  onClose: () => void
}) {
  const [pending, setPending] = useState(false)

  if (state.kind === 'none') return null

  if (state.kind === 'noReceivable') {
    return (
      <NoReceivableDialog
        client={state.client}
        action={state.action}
        failed={receivablesFailed}
        onRetry={onRetry}
        onClose={onClose}
      />
    )
  }

  if (state.kind === 'pickCollect' || state.kind === 'pickInvoice' || state.kind === 'pickExtra') {
    const kind = state.kind === 'pickCollect' ? 'collect' : state.kind === 'pickInvoice' ? 'invoice' : 'extra'
    const copy = {
      collect: { title: 'Registrar pago', description: 'Elegí sobre qué cobro se registra.' },
      invoice: { title: 'Generar factura', description: 'Elegí qué cobro se factura.' },
      extra: { title: 'Agregar trabajo extra', description: 'Elegí a qué cobro se suma.' },
    }[kind]
    return (
      <ClientReceivablePicker
        client={state.client}
        receivables={state.receivables}
        title={copy.title}
        description={copy.description}
        onPick={(receivable) => onPick(kind, state.client, receivable)}
        onClose={onClose}
      />
    )
  }

  if (state.kind === 'collect') {
    return (
      <CobrosRegistrarCobroDialog
        receivable={state.receivable}
        onCollect={onCollect.bind(null, state.receivable.id)}
        onClose={onClose}
      />
    )
  }

  if (state.kind === 'extra') {
    return (
      <ClientAddExtraWorkDialog
        client={state.client}
        onConfirm={(input) => {
          void onAddExtra(state.receivable, input)
        }}
        onClose={onClose}
      />
    )
  }

  const emitter = emitterFor(emitters, state.receivable.taxProfileId)
  return (
    <ClientGenerateInvoiceDialog
      client={state.client}
      receivable={state.receivable}
      emitter={emitter}
      emittersFailed={emittersFailed}
      pending={pending}
      onConfirm={async () => {
        if (!emitter) return
        setPending(true)
        await onGenerateInvoice(state.receivable, emitter)
        setPending(false)
      }}
      onClose={onClose}
    />
  )
}
