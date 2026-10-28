/**
 * The counterparty picker inside `CashflowCommitmentDialog`.
 *
 * A commitment that names WHICH client's abono or WHICH member's salary it is lets the
 * projection supersede it by identity instead of guessing from (week, direction,
 * category). Three categories can be named, because their money records already carry
 * the matching id (`Receivable.clientId`, `Payment.teamMemberId`, `Payment.providerId`);
 * gasto fijo, monotributo and plataforma have no counterparty record at all, so the
 * picker does not render for them and those commitments stay unlinked.
 *
 * Lives in its own file because the dialog is already past the 300-line limit in
 * the convention, and this is a self-contained control with its own fetches.
 */
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
  /** `error` is NOT `ready` with an empty list. A failed fetch that reads as "there are
   *  none" is the exact mistake that reopened a treasury bug once already: the caller
   *  must be able to tell "nothing to pick" from "we could not ask". */
  status: 'loading' | 'error' | 'ready'
}

/**
 * 100 is the API's CAP, not a preference: `listClientsQuerySchema` and
 * `listTeamQuerySchema` both declare `.max(100)`, so anything larger is a 400 and the
 * picker renders an error where the operator expects a list. It asked for 200 once, and
 * the whole link feature was inert for `retainer` and `salaries` until a review caught it.
 * The two sibling dialogs that load the same lists send the same value.
 */
export const LIST_LIMIT = 100
const LIST_PARAMS = { limit: LIST_LIMIT, offset: 0 }

/** UI copy for the field label, by entity kind. */
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

/**
 * The options for one entity kind. Exactly one of the three queries is enabled at a
 * time, keyed off the caller's category, so switching category does not fetch the other
 * two. Cached through the shared query client, so reopening the dialog does not refetch.
 */
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
  // Shares `queryKeys.emitters.lists()` with `useInvoiceEmitters`, so opening this after
  // /clientes or the factura dialog costs no fetch. Not that hook itself: it maps into
  // `RealEmitter` and consumes the error into an alert level, and this picker needs the
  // raw error to tell "could not ask" from "there are none".
  const emitters = useQuery({
    queryKey: queryKeys.emitters.lists(),
    queryFn: () => emittersApi.list(),
    enabled: type === 'invoiceEmitter',
  })

  // Depends on the query FIELDS, not the result objects: `useQuery` hands back a fresh
  // object every render, so listing them re-ran the body (and its Intl-collated sort over
  // up to 100 rows) on every keystroke in the dialog.
  return useMemo(() => {
    if (type === 'client') return toState(clients, (d) => d.items.map(pick))
    if (type === 'teamMember') return toState(members, (d) => d.items.map(pick))
    if (type === 'provider') return toState(providers, (d) => d.map(pick))
    // `label` is the emisor's display name ("Monotributo Vicky"); it has no `name`.
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
  // isFetching first, not isLoading: after an error react-query keeps status 'error'
  // through a refetch and never re-enters isLoading, so a retry would show no feedback.
  if (query.isFetching && query.data === undefined) return { options: [], status: 'loading' }
  if (query.isError) return { options: [], status: 'error' }
  if (query.data === undefined) return { options: [], status: 'loading' }
  return { options: map(query.data).sort(byName), status: 'ready' }
}

function byName(a: EntityOption, b: EntityOption): number {
  return a.name.localeCompare(b.name, 'es')
}

/**
 * Is the picker satisfied?
 *
 * Required, EXCEPT when there is nothing to require. An empty roster and a failed fetch
 * both leave the operator with no way to answer, and a dialog that cannot be submitted
 * is worse than a commitment that projects without netting (the unlinked case is already
 * a supported, one-directional outcome). Only a `ready` list with options in it blocks.
 */
export function entityLinkSatisfied(state: EntityOptionsState, entityId: string): boolean {
  // `loading` is NOT one of them. It is transient, not unanswerable: the list is about to
  // arrive, and treating it as satisfied let a fast operator submit before it did, saving
  // an unlinked commitment with no error and nothing on screen to notice.
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
      {/* States the failure, not its consequence. The consequence differs by mode: on
          create the commitment saves unlinked, on edit the existing link is re-sent
          untouched. One sentence cannot be true of both, so it names neither. */}
      {state.status === 'error' ? (
        <span className="type-caption fg-danger" role="alert">
          No se pudo cargar la lista de opciones
        </span>
      ) : null}
    </label>
  )
}
