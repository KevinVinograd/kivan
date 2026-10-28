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

/**
 * Which cobro is this action about?
 *
 * A client can have SEVERAL receivables in one month — there is no
 * `@@unique([clientId, period])` on the model, by design: one per service. So a money
 * action launched from the client row is not addressed to a single obvious record, and
 * silently picking one (or spreading an amount across them) would post money against a
 * service nobody chose. When there is exactly one the caller skips this entirely; this
 * only ever appears when the ambiguity is real.
 */
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

/**
 * What a client's money action says when there is no cobro of the month to act on.
 *
 * The action is not "broken" and it is not zero — nothing was billed. Cobros is where a
 * cobro is created, so this points there instead of offering a dead confirmation.
 */
export function NoReceivableDialog({
  client,
  action,
  failed,
  onRetry,
  onClose,
}: {
  client: Client
  action: string
  /** True when the receivables FETCH failed: an empty store is then an outage, not an
   *  empty month, and saying "no billing this month" would be inventing the good news. */
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

/**
 * The bulk-invoice plan, shown BEFORE anything is posted.
 *
 * Each factura consumes its emisor's sequence and counts against a monthly ceiling, so
 * the operator sees which monotributo issues how many, and what is being skipped and
 * why, while they can still cancel. A count-only confirmation would hide the one thing
 * that can go irreversibly wrong here.
 */
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

/**
 * Confirm issuing ONE factura, naming the emisor that will issue it.
 *
 * `/cobros` has a richer emisor-picker dialog (`cobros-generar-factura-dialog.tsx`) and
 * it is deliberately NOT reused here: it is built on the hardcoded `INVOICE_EMITTERS`
 * list, whose ids are invented strings rather than the emisor UUIDs the API needs, and
 * it applies its result to the local cache instead of calling
 * `POST /receivables/:id/invoice/generate`. Reusing it would import that phantom write
 * into `/clientes`. This one issues for real, off the emisores the server returns.
 */
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
  /** Undefined when NO emisor can issue right now — the action is then refused, not
   *  silently routed through a blocked monotributo. */
  emitter: RealEmitter | undefined
  /** True when the EMISORES fetch failed. An empty list is then an outage, and saying
   *  "todos al límite" would be a confident diagnosis of data we never received. */
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
                // Keep the confirmation standing so a failed write leaves the user where
                // they were instead of the dialog vanishing over an error toast.
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

/** Local state for the receivable-scoped money dialogs launched from a client row. */
export type ClientMoneyDialogState =
  | { kind: 'none' }
  | { kind: 'pickCollect'; client: Client; receivables: Receivable[] }
  | { kind: 'pickInvoice'; client: Client; receivables: Receivable[] }
  | { kind: 'pickExtra'; client: Client; receivables: Receivable[] }
  | { kind: 'collect'; client: Client; receivable: Receivable }
  | { kind: 'invoice'; client: Client; receivable: Receivable }
  | { kind: 'extra'; client: Client; receivable: Receivable }
  | { kind: 'noReceivable'; client: Client; action: string }

/** Small hook so the page keeps one state machine for all three money actions. */
export function useMoneyDialog() {
  return useState<ClientMoneyDialogState>({ kind: 'none' })
}

/**
 * Renders whichever money dialog the state names. One switch keeps the three actions on
 * the same resolution path (pick → act → close), so a new one cannot quietly skip it.
 */
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
