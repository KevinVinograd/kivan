import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Button, Input, toast } from '@/app/components/components'
import { PanelContent, SectionHeader } from '@/app/components/templates'
import { useAuth } from '@/app/lib/auth-store'
import { useSignOut } from '@/app/lib/use-sign-out'
import { profileApi } from '@/api/profile'
import { queryKeys } from '@/queries/keys'
import { Field, SettingGroup } from './settings-fields'

/** Minimum new-password length accepted by the API (`changePasswordSchema`). */
const MIN_PASSWORD_LENGTH = 8

/**
 * Mi perfil — the personal section every role can see, and the only section a member of
 * the Equipo reaches. Name changes persist through `PUT /me/profile`; the password form
 * goes through `PUT /me/password`, which requires the current password and revokes every
 * session — so a successful change signs the person out and back to login. Email is
 * read-only (no endpoint changes it), and there is no bank section here: a person's payout
 * account lives on their Equipo record, not on their login.
 */
export function SettingsProfile() {
  const { me } = useAuth()
  const queryClient = useQueryClient()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  // Seed the form from the real signed-in user once `/auth/me` resolves.
  useEffect(() => {
    if (!me) return
    setFirstName(me.firstName)
    setLastName(me.lastName)
  }, [me])

  const [passwordOpen, setPasswordOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Shared with the rail's avatar menu so both entry points end a session identically.
  const onLogout = useSignOut()

  const profileMutation = useMutation({
    mutationFn: profileApi.update,
    onSuccess: async () => {
      // Refresh the signed-in identity so the rail avatar and the dashboard greetings pick
      // up the new name immediately, instead of holding the old one until the next reload.
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.me })
      toast.success('Perfil actualizado')
    },
    onError: () => toast.error('No se pudo actualizar el perfil'),
  })

  const passwordMutation = useMutation({
    mutationFn: profileApi.changePassword,
    onSuccess: () => {
      // The API revoked every session, so the only honest next step is a fresh login.
      toast.success('Contraseña actualizada. Iniciá sesión de nuevo.')
      onLogout()
    },
    onError: () => toast.error('No se pudo cambiar la contraseña. ¿La actual es correcta?'),
  })

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword
  const canChangePassword =
    currentPassword.length > 0 && newPassword.length >= MIN_PASSWORD_LENGTH && passwordsMatch

  return (
    <>
      <SectionHeader
        title="Mi perfil"
        description="Tus datos personales y la seguridad de tu acceso."
        actions={
          <Button
            variant="solid"
            color="primary"
            size="dense"
            disabled={profileMutation.isPending || !firstName.trim() || !lastName.trim()}
            onClick={() => profileMutation.mutate({ firstName: firstName.trim(), lastName: lastName.trim() })}
          >
            <span className="sm:hidden">Guardar</span>
            <span className="hidden sm:block">Guardar cambios</span>
          </Button>
        }
      />
      <PanelContent layout="stacked">
        <SettingGroup title="Datos personales">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Apellido">
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={me?.email ?? ''} readOnly disabled />
            </Field>
          </div>
        </SettingGroup>

        <SettingGroup title="Seguridad" description="Acceso a tu cuenta.">
          {passwordOpen ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Contraseña actual">
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </Field>
                <div className="hidden sm:block" />
                <Field label="Nueva contraseña">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Repetir nueva contraseña">
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
              </div>
              {confirmPassword.length > 0 && !passwordsMatch ? (
                <p className="type-caption fg-danger">Las contraseñas no coinciden.</p>
              ) : (
                <p className="type-caption fg-subtle">
                  Al cambiarla se cierran todas tus sesiones y vas a volver a iniciar sesión.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="solid"
                  color="primary"
                  size="dense"
                  disabled={!canChangePassword || passwordMutation.isPending}
                  onClick={() => passwordMutation.mutate({ currentPassword, newPassword })}
                >
                  {passwordMutation.isPending ? 'Guardando…' : 'Guardar contraseña'}
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  size="dense"
                  onClick={() => {
                    setPasswordOpen(false)
                    setCurrentPassword('')
                    setNewPassword('')
                    setConfirmPassword('')
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outlined"
                color="primary"
                size="dense"
                onClick={() => setPasswordOpen(true)}
              >
                Cambiar contraseña
              </Button>
              <Button variant="outlined" color="danger" size="dense" onClick={onLogout}>
                Cerrar sesión
              </Button>
            </div>
          )}
        </SettingGroup>
      </PanelContent>
    </>
  )
}
