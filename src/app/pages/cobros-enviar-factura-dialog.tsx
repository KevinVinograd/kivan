import { useState } from 'react'

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@/app/components/components'
import { buildSendMessage, type SendChannel } from './cobros-invoice'
import type { Receivable } from './cobros-mock-data'

const CHANNEL_LABEL: Record<SendChannel, string> = {
  factura: 'Factura',
  cuenta_corriente: 'Cuenta corriente',
}

// No real delivery integration exists yet, so the toast says "marcada como
// enviada" rather than asserting the document actually reached the client.
const SENT_TOAST: Record<SendChannel, string> = {
  factura: 'Factura marcada como enviada',
  cuenta_corriente: 'Cuenta corriente marcada como enviada',
}

/**
 * Enviar factura o cuenta corriente (§9.8). No real delivery integration exists,
 * so the MVP prepares the message and lets the user copy it or mark it as sent
 * (a local mutation to the "Factura enviada" state). Copy uses the real clipboard;
 * a PDF download is intentionally omitted rather than faked.
 */
export function CobrosEnviarFacturaDialog({
  receivable,
  onSend,
  onClose,
}: {
  receivable: Receivable
  /** Persist the sent state (POST /receivables/:id/invoice/sent). */
  onSend: (id: string) => Promise<void>
  onClose: () => void
}) {
  const [channel, setChannel] = useState<SendChannel>('factura')
  const [submitting, setSubmitting] = useState(false)
  const message = buildSendMessage(receivable, channel)

  function handleCopy() {
    navigator.clipboard
      .writeText(message)
      .then(() => toast.success('Mensaje copiado'))
      .catch(() => toast.error('No se pudo copiar el mensaje'))
  }

  async function handleMarkSent() {
    if (submitting) return
    setSubmitting(true)
    try {
      await onSend(receivable.id)
    } catch {
      toast.error('No se pudo marcar como enviado')
      setSubmitting(false)
      return
    }
    toast.success(SENT_TOAST[channel])
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar</DialogTitle>
          <DialogDescription>{receivable.clientName}</DialogDescription>
        </DialogHeader>

        <label className="flex flex-col gap-1.5">
          <span className="type-caption fg-subtle">Qué enviar</span>
          <Select value={channel} onValueChange={(value) => setChannel(value as SendChannel)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="factura">{CHANNEL_LABEL.factura}</SelectItem>
              <SelectItem value="cuenta_corriente">{CHANNEL_LABEL.cuenta_corriente}</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <div className="flex flex-col gap-2">
          <span className="type-caption fg-subtle">Mensaje</span>
          <div className="whitespace-pre-line rounded-control border border-alpha-subtle bg-alpha-subtle p-3 type-body-2 fg-default">
            {message}
          </div>
          <div className="flex justify-end">
            <Button variant="outlined" color="primary" size="dense" onClick={handleCopy}>
              Copiar mensaje
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outlined" color="primary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="solid" color="primary" onClick={handleMarkSent}>
            Marcar como enviado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
