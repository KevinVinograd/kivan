/**
 * Contact-client helpers — assembles a pre-filled email for the "Contactar
 * cliente" action and builds the mailto / WhatsApp deep links. The draft copy is
 * situational (pending payment, next action, otherwise a check-in), generated
 * from the client's current state. No backend: the modal hands these links to
 * the OS mail client / WhatsApp. Mock stand-in for a real template/CRM.
 */
import type { Client } from './clients-mock-data'
import { formatCurrency } from './clients-format'

export type ContactDraft = {
  to: string
  toName: string
  subject: string
  body: string
}

/** Pre-fills subject + body + recipient for a client, by current situation. */
export function contactDraft(client: Client): ContactDraft {
  const toName = client.contactName ?? client.name
  const to = client.billingEmail ?? ''
  const greeting = `Hola ${toName},`

  let point: string
  // Both branches are reachable only when a payment status exists, which only happens
  // when a cobro does — so the amounts below are always real, never a defaulted zero.
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

/** Digits-only phone for WhatsApp links. */
function phoneDigits(phone?: string): string {
  return (phone ?? '').replace(/\D/g, '')
}

/**
 * `mailto:` deep link with the subject + body pre-filled. Accepts one or more
 * recipients (comma-joined per RFC 6068); empty entries are dropped.
 */
export function mailtoLink(recipients: string[], subject: string, body: string): string {
  const to = recipients.map((email) => email.trim()).filter(Boolean).join(',')
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** `wa.me` deep link to the client's number (text-only when no number). */
export function whatsappLink(client: Client, body: string): string {
  const digits = phoneDigits(client.phone)
  const text = encodeURIComponent(body)
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`
}
