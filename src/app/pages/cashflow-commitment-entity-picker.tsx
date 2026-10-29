import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/components'
import { clientsApi } from '@/api/clients'
import { emittersApi } from '@/api/emitters'
import { paymentsApi } from '@/api/payments'
import { teamApi } from '@/api/team'
import { queryKeys } from '@/queries/keys'
import type { LinkedEntityType } from './treasury-mock-data'

export type EntityOption = { id: string; name: string }

export type EntityOptionsState = {
  options: EntityOption[]
  status: 'loading' | 'error' | 'ready'
}

export const LIST_LIMIT = 100
const LIST_PARAMS = { limit: LIST_LIMIT, offset: 0 }

export const ENTITY_TYPE_LABEL: Record<LinkedEntityType, string> = {
  client: 'Cliente',
  teamMember: 'Colaboradora',
  provider: 'Proveedor',
  invoiceEmitter: 'Monotributo',
}

const EMPTY_HINT: Record<LinkedEntityType, string> = {
  client: 'No hay clientes cargados',
  teamMember: 'No hay colaboradoras cargadas',
  provider: 'No hay proveedores cargados',
  invoiceEmitter: 'No hay monotributos cargados',
}

export function useEntityOptions(type: LinkedEntityType | undefined): EntityOptionsState {
  const clients = useQuery({
    queryKey: queryKeys.clients.list(LIST_PARAMS),
    queryFn: () => clientsApi.list(LIST_PARAMS),
    enabled: type === 'client',
  })
  const members = useQuery({
    queryKey: queryKeys.team.lists(),
    queryFn: () => teamApi.list(LIST_PARAMS),
    enabled: type === 'teamMember',
  })
  const providers = useQuery({
    queryKey: queryKeys.payments.providers(),
    queryFn: () => paymentsApi.listProviders(),
    enabled: type === 'provider',
  })
  const emitters = useQuery({
    queryKey: queryKeys.emitters.lists(),
    queryFn: () => emittersApi.list(),
    enabled: type === 'invoiceEmitter',
  })

  return useMemo(() => {
    if (type === 'client') return toState(clients, (d) => d.items.map(pick))
    if (type === 'teamMember') return toState(members, (d) => d.items.map(pick))
    if (type === 'provider') return toState(providers, (d) => d.map(pick))
    if (type === 'invoiceEmitter')
      return toState(emitters, (d) => d.map((e) => ({ id: e.id, name: e.label })))
    return { options: [], status: 'ready' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    type,
    clients.data, clients.isError, clients.isFetching,
    members.data, members.isError, members.isFetching,
    providers.data, providers.isError, providers.isFetching,
    emitters.data, emitters.isError, emitters.isFetching,
  ])
}

function pick(row: { id: string; name: string }): EntityOption {
  return { id: row.id, name: row.name }
}

function toState<T>(
  query: { data?: T; isError: boolean; isFetching: boolean },
  map: (data: T) => EntityOption[],
): EntityOptionsState {
  if (query.isFetching && query.data === undefined) return { options: [], status: 'loading' }
  if (query.isError) return { options: [], status: 'error' }
  if (query.data === undefined) return { options: [], status: 'loading' }
  return { options: map(query.data).sort(byName), status: 'ready' }
}

function byName(a: EntityOption, b: EntityOption): number {
  return a.name.localeCompare(b.name, 'es')
}

export function entityLinkSatisfied(state: EntityOptionsState, entityId: string): boolean {
  if (state.status === 'loading') return false
  if (state.status === 'error') return true
  return state.options.length === 0 || entityId !== ''
}

export function CommitmentEntityPicker({
  type,
  value,
  onChange,
  state,
}: {
  type: LinkedEntityType
  value: string
  onChange: (next: string) => void
  state: EntityOptionsState
}) {
  const label = ENTITY_TYPE_LABEL[type]
  const placeholder =
    state.status === 'loading'
      ? 'Cargando'
      : state.status === 'error'
        ? 'No se pudo cargar'
        : state.options.length === 0
          ? EMPTY_HINT[type]
          : `Elegí un ${label.toLowerCase()}`

  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={state.status !== 'ready' || state.options.length === 0}
      >
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {state.options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {state.status === 'error' ? (
        <span className="type-caption fg-danger" role="alert">
          No se pudo cargar la lista de opciones
        </span>
      ) : null}
    </label>
  )
}
