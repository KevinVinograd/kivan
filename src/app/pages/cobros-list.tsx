import { useState } from 'react'

import { cn } from '@/app/lib/utils'
import { Avatar, AvatarFallback, Badge, Input } from '@/app/components/components'
import { PanelContent } from '@/app/components/templates'
import { formatMoney, initials } from './cobranza-format'
import { balanceOf, collectionStatusBadge, effectiveCollectionStatus, receivableSearchText } from './cobros-format'
import type { Receivable } from './cobros-mock-data'

function CobrosListItem({
  receivable,
  active,
  onSelect,
}: {
  receivable: Receivable
  active: boolean
  onSelect: (id: string) => void
}) {
  const status = collectionStatusBadge(effectiveCollectionStatus(receivable))
  const balance = balanceOf(receivable)
  return (
    <button
      type="button"
      onClick={() => onSelect(receivable.id)}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex items-start gap-3 rounded-control px-3 py-2 text-left motion-standard',
        active ? 'bg-alpha-subtle-active' : 'hover:bg-alpha-subtle-hover',
      )}
    >
      <Avatar size="sm" active={active} className="shrink-0">
        <AvatarFallback>{initials(receivable.clientName)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate type-button fg-default">{receivable.clientName}</span>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <div className="flex items-center gap-1 type-caption fg-subtle tabular-nums">
          <span>{formatMoney(receivable.totalAmount, receivable.currency)}</span>
          {balance > 0 ? <span>· Saldo {formatMoney(balance, receivable.currency)}</span> : null}
        </div>
      </div>
    </button>
  )
}

export function CobrosList({
  receivables,
  selectedId,
  onSelect,
}: {
  receivables: Receivable[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()
  const filtered = normalized
    ? receivables.filter((r) => receivableSearchText(r).includes(normalized))
    : receivables

  return (
    <PanelContent layout="stacked" flushTop>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por cliente, CUIT o factura"
        aria-label="Buscar cobros"
        className="shrink-0"
      />
      <div className="flex flex-col gap-1">
        {filtered.length > 0 ? (
          filtered.map((receivable) => (
            <CobrosListItem
              key={receivable.id}
              receivable={receivable}
              active={receivable.id === selectedId}
              onSelect={onSelect}
            />
          ))
        ) : (
          <p className="px-3 py-6 text-center type-caption fg-subtle">No encontramos cobros</p>
        )}
      </div>
    </PanelContent>
  )
}
