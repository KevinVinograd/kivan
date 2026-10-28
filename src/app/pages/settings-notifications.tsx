import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Button, toast } from '@/app/components/components'
import { PanelContent, SectionHeader } from '@/app/components/templates'
import { ApiError } from '@/api/client'
import { notificationsApi, type NotificationPrefs } from '@/api/notifications'
import { queryKeys } from '@/queries/keys'
import { SettingGroup, ToggleRow } from './settings-fields'

/**
 * Notificaciones — open to every role, and PER PERSON: these are the caller's own
 * preferences (`GET`/`PUT /me/notification-preferences`), so two admins can want
 * different notices.
 *
 * Notices are IN-APP only: they appear in the app's own inbox, which is why there is no
 * channel picker any more. The section used to offer Email and WhatsApp toggles and a
 * "Recordatorios de cobro" event, none of which existed — no mailer was wired to this, no
 * WhatsApp integration exists, and a time-based reminder needs a scheduler the deployment
 * does not have. Offering them was the fabricated promise this rewrite removes; the three
 * events below are the ones the API actually emits.
 */
const DEFAULT_PREFS: NotificationPrefs = {
  'month.closed': true,
  'payment.approved': true,
  'statement.sent': true,
}

export function SettingsNotifications() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.notifications.prefs(),
    queryFn: notificationsApi.getPrefs,
    staleTime: 60_000,
  })

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS)
  const loaded = query.data
  useEffect(() => {
    if (loaded) setPrefs(loaded)
  }, [loaded])

  const saveMutation = useMutation({
    mutationFn: () => notificationsApi.savePrefs(prefs),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications.prefs() })
      toast.success('Preferencias de notificación guardadas')
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : 'No se pudieron guardar las preferencias',
      ),
  })

  const toggle = (key: keyof NotificationPrefs) => (checked: boolean) =>
    setPrefs((prev) => ({ ...prev, [key]: checked }))

  return (
    <>
      <SectionHeader
        title="Notificaciones"
        description="Qué movimientos querés que te avisemos dentro de la app."
        actions={
          <Button
            variant="solid"
            color="primary"
            size="dense"
            disabled={query.isLoading || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            <span className="sm:hidden">Guardar</span>
            <span className="hidden sm:block">Guardar cambios</span>
          </Button>
        }
      />
      <PanelContent layout="stacked">
        {query.isError ? (
          // Never present the defaults as if they were what this person chose.
          <p className="type-body-2 fg-danger">
            No pudimos cargar tus preferencias. Estás viendo los valores por defecto.
          </p>
        ) : null}
        <SettingGroup
          title="Eventos"
          description="Los avisos aparecen en la campana, arriba a la derecha."
        >
          <ToggleRow
            label="Cierre de mes"
            description="Cuando alguien cierra la operación del mes."
            checked={prefs['month.closed']}
            onCheckedChange={toggle('month.closed')}
          />
          <ToggleRow
            label="Pago aprobado"
            description="Cuando se aprueba un pago del equipo o a un proveedor."
            checked={prefs['payment.approved']}
            onCheckedChange={toggle('payment.approved')}
          />
          <ToggleRow
            label="Estado de cuenta enviado"
            description="Cuando se marca como enviado el comprobante de un cliente."
            checked={prefs['statement.sent']}
            onCheckedChange={toggle('statement.sent')}
          />
        </SettingGroup>
      </PanelContent>
    </>
  )
}
