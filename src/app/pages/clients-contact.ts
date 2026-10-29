import type { Client } from './clients-mock-data'
import { formatCurrency } from './clients-format'

export type ContactDraft = {
  to: string
  toName: string
  subject: string
  body: string
}

export function contactDraft(client: Client): ContactDraft {
  const toName = client.contactName ?? client.name
  const to = client.billingEmail ?? ''
  const greeting = `Hola ${toName},`

  let point: string
  const outstanding = Math.max(
    (client.currentMonthDueAmount ?? 0) - (client.currentMonthPaidAmount ?? 0),
    0,
  )
  if (client.paymentStatus === 'overdue') {
    const pending = outstanding
    point = `Queríamos recordarte que el pago de ${formatCurrency(pending)} de este mes figura como vencido. Te agradeceríamos poder regularizarlo cuando puedas.`
  } else if (client.paymentStatus === 'partial') {
    const pending = outstanding
    point = `Registramos un pago parcial de este mes y queda un saldo pendiente de ${formatCurrency(pending)}. Quedamos a disposición para coordinar el resto.`
  } else if (client.nextAction) {
    point = `Queríamos coordinar con vos respecto a: ${client.nextAction.toLowerCase()}.`
  } else {
    point = 'Queríamos hacer un seguimiento de cómo viene todo y si hay algo en lo que podamos ayudarte.'
  }

  const subject = `Seguimiento de ${client.name}`
  const body = `${greeting}\n\n${point}\n\nCualquier duda quedamos a disposición.\n\nSaludos.`
  return { to, toName, subject, body }
}

function phoneDigits(phone?: string): string {
  return (phone ?? '').replace(/\D/g, '')
}

export function mailtoLink(recipients: string[], subject: string, body: string): string {
  const to = recipients.map((email) => email.trim()).filter(Boolean).join(',')
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function whatsappLink(client: Client, body: string): string {
  const digits = phoneDigits(client.phone)
  const text = encodeURIComponent(body)
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`
}
