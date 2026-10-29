import { useState } from 'react'

import { cn } from '@/app/lib/utils'
import { Avatar, AvatarFallback, Badge, Input } from '@/app/components/components'
import { PanelContent } from '@/app/components/templates'
import { formatMoney, initials } from './cobranza-format'
import {
  paymentBalanceOf,
  paymentSearchText,
  paymentStatusBadge,
  RECIPIENT_TYPE_LABEL,
} from './pagos-format'
import type { Payment } from './pagos-mock-data'

function PagosListItem({
  payment,
  active,
  onSelect,
}: {
  payment: Payment
  active: boolean
  onSelect: (id: string) => void
}) {
  const status = paymentStatusBadge(payment.status)
  const balance = paymentBalanceOf(payment)
  return (
    <button
      type="button"
      onClick={() => onSelect(payment.id)}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex items-start gap-3 rounded-control px-3 py-2 text-left motion-standard',
        active ? 'bg-alpha-subtle-active' : 'hover:bg-alpha-subtle-hover',
      )}
    >
      <Avatar size="sm" active={active} className="shrink-0">
        <AvatarFallback>{initials(payment.recipientName)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate type-button fg-default">{payment.recipientName}</span>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <div className="flex items-center gap-1 type-caption fg-subtle tabular-nums">
          <span>{formatMoney(payment.totalAmount, payment.currency)}</span>
          {balance > 0 ? <span>· Saldo {formatMoney(balance, payment.currency)}</span> : null}
        </div>
        <span className="type-caption fg-subtle">{RECIPIENT_TYPE_LABEL[payment.recipientType]}</span>
      </div>
    </button>
  )
}

export function PagosList({
  payments,
  selectedId,
  onSelect,
}: {
  payments: Payment[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()
  const filtered = normalized
    ? payments.filter((p) => paymentSearchText(p).includes(normalized))
    : payments

  return (
    <PanelContent layout="stacked" flushTop>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por nombre, alias o concepto"
        aria-label="Buscar pagos"
        className="shrink-0"
      />
      <div className="flex flex-col gap-1">
        {filtered.length > 0 ? (
          filtered.map((payment) => (
            <PagosListItem
              key={payment.id}
              payment={payment}
              active={payment.id === selectedId}
              onSelect={onSelect}
            />
          ))
        ) : (
          <p className="px-3 py-6 text-center type-caption fg-subtle">No encontramos pagos</p>
        )}
      </div>
    </PanelContent>
  )
}
