import { useState } from 'react'

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/app/components/components'
import type { Client, ClientStatus } from './clients-mock-data'
import {
  CLIENT_STATUS_LABEL,
  formatCurrency,
  formatDiscountPercent,
  netMonthlyFee,
} from './clients-format'
import { formatMoney } from './cobranza-format'
import { mailtoLink, whatsappLink } from './clients-contact'

const STATUS_OPTIONS: ClientStatus[] = ['active', 'onboarding', 'paused', 'churned']

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      {children}
    </label>
  )
}

/**
 * Bulk "Cambiar estado" dialog: pick a target status and apply it to the selected
 * clients in one shot. The explicit status choice plus the named count is the
 * confirmation surface for this materially-changing action (feedback Section 7);
 * the page applies the mutation and confirms with a success toast (Section 4).
 */
export function ClientsChangeStatusDialog({
  clients,
  onConfirm,
  onClose,
}: {
  clients: Client[]
  onConfirm: (status: ClientStatus) => void
  onClose: () => void
}) {
  const [status, setStatus] = useState<ClientStatus>('active')
  const count = clients.length
  // Bulk baja is destructive (drops clients from the active portfolio) and must
  // carry the same danger treatment as the per-client churn confirmation; pausar
  // is reversible but still worth a caution before applying it in bulk.
  const isChurn = status === 'churned'
  const isPause = status === 'paused'

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            onConfirm(status)
          }}
        >
          <DialogHeader>
            <DialogTitle>Cambiar estado</DialogTitle>
            <DialogDescription>
              {count} {count === 1 ? 'cliente pasará' : 'clientes pasarán'} al estado seleccionado.
            </DialogDescription>
          </DialogHeader>

          <Field label="Nuevo estado">
            <Select value={status} onValueChange={(value) => setStatus(value as ClientStatus)}>
              <SelectTrigger className="w-full" aria-label="Nuevo estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {CLIENT_STATUS_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {isChurn ? (
            <p className="type-body-2 fg-danger">
              Los clientes deshabilitados salen del flujo activo y dejan de facturarse, pero siguen
              en la lista y se pueden reactivar.
            </p>
          ) : isPause ? (
            <p className="type-body-2 fg-warning">
              Los clientes pausados se ocultan del flujo activo hasta reactivarlos.
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="solid"
              color={isChurn ? 'danger' : 'primary'}
              disabled={count === 0}
            >
              {isChurn ? 'Deshabilitar' : isPause ? 'Pausar' : 'Cambiar estado'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * "Agregar trabajo extra" dialog: a description + amount for out-of-scope work.
 * The page bills it (adds the amount to the client's current-month due) and records
 * the description in the client's notes, then confirms with a success toast.
 */
export function ClientAddExtraWorkDialog({
  client,
  onConfirm,
  onClose,
}: {
  client: Client
  onConfirm: (input: { description: string; amount: number }) => void
  onClose: () => void
}) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState(0)

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            onConfirm({ description: description || 'Trabajo extra', amount })
          }}
        >
          <DialogHeader>
            <DialogTitle>Agregar trabajo extra</DialogTitle>
            <DialogDescription>
              {client.name} · se suma al total a cobrar de este mes.
            </DialogDescription>
          </DialogHeader>

          <Field label="Descripción">
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="Monto (ARS)">
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value) || 0)}
            />
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={amount <= 0}>
              Agregar trabajo extra
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The abono lines of the statement: the contracted fee, and — when the client has a
 * standing discount — what it comes off and what they actually pay.
 *
 * Gross with the discount shown beside it rather than a single net figure. This text is
 * SENT TO THE CLIENT, so it is the one place where a number the counterparty can
 * contradict has to be the number on their contract, with the arithmetic visible.
 */
function abonoLines(client: Client): string[] {
  // The CONTRACT's lane, which is what `client.currency` is. These lines are sent to the
  // client, and they quoted a dollar-priced abono as pesos — a figure the counterparty can
  // read off their own contract and see is wrong. No aggregate is involved: each line is
  // one contract amount in one lane, so there is no sibling total to keep in step.
  const money = (amount: number) => formatMoney(amount, client.currency)
  const gross = `Abono mensual: ${money(client.monthlyFee)}`
  if (!client.discountPercentBp) return [gross]
  return [
    gross,
    `Descuento (${formatDiscountPercent(client.discountPercentBp)}): -${money(
      client.monthlyFee - netMonthlyFee(client),
    )}`,
    `Abono con descuento: ${money(netMonthlyFee(client))}`,
  ]
}

/** Build the cuenta corriente message body for a client (mock statement). */
function statementBody(client: Client): string {
  const toName = client.contactName ?? client.name
  // A client with no cobro this month gets a statement that says so, rather than a
  // pile of $0 lines that read as a settled account.
  if (client.currentMonthDueAmount == null) {
    return [
      `Hola ${toName},`,
      '',
      'Este mes todavía no tenés cobros cargados de nuestro lado.',
      ...abonoLines(client),
      '',
      'Cualquier duda quedamos a disposición.',
      '',
      'Saludos.',
    ].join('\n')
  }
  const paid = client.currentMonthPaidAmount ?? 0
  const pending = Math.max(client.currentMonthDueAmount - paid, 0)
  return [
    `Hola ${toName},`,
    '',
    'Te compartimos el estado de tu cuenta corriente de este mes:',
    ...abonoLines(client),
    `Pagado: ${formatCurrency(paid)}`,
    `A cobrar: ${formatCurrency(client.currentMonthDueAmount)}`,
    `Pendiente: ${formatCurrency(pending)}`,
    '',
    'Cualquier duda quedamos a disposición.',
    '',
    'Saludos.',
  ].join('\n')
}

/**
 * "Enviar cuenta corriente" dialog: composes the statement summary and hands it to
 * the OS mail client or WhatsApp (no backend, mirrors the Contactar cliente send
 * pattern). The OS owns the actual send, so the page confirms that a DRAFT opened —
 * not a delivery it cannot observe.
 */
export function ClientSendStatementDialog({
  client,
  onSent,
  onClose,
}: {
  client: Client
  onSent: () => void
  onClose: () => void
}) {
  const [email, setEmail] = useState(client.billingEmail ?? '')
  const [body, setBody] = useState(() => statementBody(client))
  const subject = `Cuenta corriente de ${client.name}`

  function sendByMail() {
    window.location.href = mailtoLink([email], subject, body)
    onSent()
    onClose()
  }

  function sendByWhatsApp() {
    window.open(whatsappLink(client, body), '_blank', 'noopener,noreferrer')
    onSent()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar cuenta corriente</DialogTitle>
          <DialogDescription>
            Revisá el resumen y enviáselo a {client.contactName ?? client.name} por mail o WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Field label="Para">
            <Input
              type="email"
              value={email}
              placeholder="nombre@empresa.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Mensaje">
            <Textarea value={body} className="min-h-48" onChange={(event) => setBody(event.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outlined" color="primary">
              Cancelar
            </Button>
          </DialogClose>
          <Button variant="outlined" color="primary" onClick={sendByWhatsApp}>
            Enviar por WhatsApp
          </Button>
          <Button variant="solid" color="primary" onClick={sendByMail}>
            Enviar por mail
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
