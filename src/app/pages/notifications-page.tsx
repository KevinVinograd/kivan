import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Badge, Button, toast } from '@/app/components/components'
import { PageContent, PageHeader, Panel } from '@/app/components/templates'
import { notificationsApi, type NotificationDto } from '@/api/notifications'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import { queryKeys } from '@/queries/keys'
import { formatRelativeDate } from './cobranza-format'

/**
 * Avisos (`/notificaciones`) — the in-app inbox. Every notice here was written by a real
 * action inside its own transaction (a month closed, a payment approved, a statement
 * sent), so nothing in this list announces something that did not commit.
 *
 * Strictly per person: the API only ever returns and marks the caller's own rows, and the
 * unread count in the nav badge is this same query.
 */

/** Spanish label per event key. An unknown type (a notice written by a newer server)
 *  still renders — it shows its own title, just without a translated kind. */
const TYPE_LABEL: Record<string, string> = {
  'month.closed': 'Cierre de mes',
  'payment.approved': 'Pago aprobado',
  'statement.sent': 'Estado de cuenta',
}

/** `2026-08-05T12:30:00Z` → `05/08 12:30`. Local calendar, like every other date here. */
function NoticeRow({ notice, onRead }: { notice: NotificationDto; onRead: (id: string) => void }) {
  const unread = notice.readAt == null
  return (
    <div className="flex items-start justify-between gap-3 border-b border-alpha-subtle py-3 last:border-b-0">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* Unread is carried by the badge, not by a colored title: status lives on the
              badge (figure-color-restraint). */}
          {unread ? <Badge variant="neutral">Nuevo</Badge> : null}
          <span className="type-caption fg-subtle">{TYPE_LABEL[notice.type] ?? notice.type}</span>
          <span className="type-caption fg-subtle">{formatRelativeDate(notice.createdAt)}</span>
        </div>
        <span className="type-body-2 fg-default">{notice.title}</span>
        {notice.body ? <span className="type-caption fg-subtle">{notice.body}</span> : null}
      </div>
      {unread ? (
        <Button variant="outlined" color="primary" size="dense" onClick={() => onRead(notice.id)}>
          Marcar leído
        </Button>
      ) : null}
    </div>
  )
}

export function NotificationsPage() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.notifications.list(false),
    queryFn: () => notificationsApi.list(),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })

  const readMutation = useMutation({
    mutationFn: (ids: string[]) => notificationsApi.markRead(ids),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo marcar como leído'),
  })
  const readAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: async () => {
      await invalidate()
      toast.success('Listo, marcamos todo como leído')
    },
    onError: () => toast.error('No se pudieron marcar como leídos'),
  })

  const items = query.data?.items ?? []
  const unread = query.data?.unread ?? 0

  let body
  if (query.isLoading) {
    body = <p className="type-body-2 fg-subtle">Cargando avisos…</p>
  } else if (query.isError) {
    // Never show an empty inbox over a failed fetch: "no tenés avisos" is a different
    // claim from "no pudimos traerlos" (SE001).
    body = (
      <div className="flex flex-col items-start gap-2">
        <p className="type-body-2 fg-danger">No pudimos cargar tus avisos.</p>
        <Button variant="outlined" color="primary" size="dense" onClick={() => void query.refetch()}>
          Reintentar
        </Button>
      </div>
    )
  } else if (items.length === 0) {
    body = (
      <p className="type-body-2 fg-subtle">
        No tenés avisos. Te vamos a avisar acá cuando se cierre un mes, se apruebe un pago o se
        envíe un estado de cuenta.
      </p>
    )
  } else {
    body = (
      <div className="flex flex-col">
        {items.map((notice) => (
          <NoticeRow key={notice.id} notice={notice} onRead={(id) => readMutation.mutate([id])} />
        ))}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Avisos"
        description="Lo que pasó en la operación mientras no estabas."
        actions={
          unread > 0
            ? [
                {
                  key: 'read-all',
                  label: 'Marcar todo leído',
                  icon: AFFORDANCE.selected,
                  variant: 'outlined' as const,
                  primary: true,
                  onClick: () => readAllMutation.mutate(),
                },
              ]
            : undefined
        }
      />
      <PageContent>
        <Panel type="medium">{body}</Panel>
      </PageContent>
    </>
  )
}
