import { useId } from 'react'
import { Link, useSearchParams } from 'react-router'

import { Button, Input } from '@/app/components/components'
import { AuthSplitLayout } from './auth-split-layout'
import {
  MIN_PASSWORD_LENGTH,
  useAcceptInvitationForm,
  type ProfileField,
} from './use-accept-invitation-form'

/**
 * Aceptar invitación — the pre-auth set-password surface (route
 * `/aceptar-invitacion?token=…`), rendered outside the AppShell and reached from
 * the invitation email's link. The member chooses a password, which activates
 * their account; then they sign in at `/login`. Reuses `AuthSplitLayout` like the
 * other pre-auth surfaces (login / recuperar-contraseña).
 *
 * Two steps for a first-time invite: the password, then the ficha only this person can
 * fill in. The second step is skipped entirely for a password RESET and for a login with
 * no roster person behind it — the server decides which, and the screen asks.
 */
/** One labelled field of the ficha. Extracted because the step has six of them and the
 *  label/input/id wiring is the part that is easy to get subtly wrong (a `htmlFor` that
 *  points nowhere reads fine and breaks the screen reader). */
function ProfileInput({
  idPrefix,
  field,
  label,
  value,
  onChange,
  autoComplete,
  required,
  autoFocus,
}: {
  idPrefix: string
  field: ProfileField
  label: string
  value: string
  onChange: (field: ProfileField, value: string) => void
  autoComplete?: string
  required?: boolean
  autoFocus?: boolean
}) {
  const id = `${idPrefix}-${field}`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="type-button fg-default">
        {label}
      </label>
      <Input
        id={id}
        name={field}
        value={value}
        onChange={(event) => onChange(field, event.target.value)}
        {...(autoComplete ? { autoComplete } : {})}
        {...(required ? { required: true } : {})}
        {...(autoFocus ? { autoFocus: true } : {})}
      />
    </div>
  )
}

export function AcceptInvitationPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const {
    password,
    setPassword,
    confirm,
    setConfirm,
    needsProfile,
    firstName,
    step,
    profile,
    setProfileField,
    pending,
    submitted,
    error,
    onSubmit,
    back,
  } = useAcceptInvitationForm(token)
  const passwordId = useId()
  const confirmId = useId()
  const profileId = useId()

  if (submitted) {
    return (
      <AuthSplitLayout title="Contraseña lista">
        <div className="flex flex-col gap-6">
          <p className="type-body-2 fg-subtle">
            Ya podés iniciar sesión con tu nueva contraseña.
          </p>
          <Link
            to="/login"
            className="self-start rounded-control type-body-2 fg-subtle outline-none transition-colors hover:fg-default focus-visible:ring-2 focus-visible:ring-focus"
          >
            Iniciar sesión
          </Link>
        </div>
      </AuthSplitLayout>
    )
  }

  if (!token) {
    return (
      <AuthSplitLayout title="Enlace inválido">
        <div className="flex flex-col gap-6">
          <p className="type-body-2 fg-subtle">
            Este enlace no es válido. Pedile uno nuevo a tu administrador.
          </p>
          <Link
            to="/login"
            className="self-start rounded-control type-body-2 fg-subtle outline-none transition-colors hover:fg-default focus-visible:ring-2 focus-visible:ring-focus"
          >
            Volver a iniciar sesión
          </Link>
        </div>
      </AuthSplitLayout>
    )
  }

  if (step === 'profile') {
    return (
      <AuthSplitLayout
        title="Completá tus datos"
        subtitle="Los necesitamos para poder pagarte. Solo vos los sabés."
      >
        <form className="flex flex-col gap-8" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-3">
            <ProfileInput
              idPrefix={profileId}
              field="phone"
              label="Teléfono"
              autoComplete="tel"
              value={profile.phone ?? ''}
              onChange={setProfileField}
              required
              autoFocus
            />
            <ProfileInput
              idPrefix={profileId}
              field="taxId"
              label="CUIT / CUIL"
              value={profile.taxId ?? ''}
              onChange={setProfileField}
              required
            />
            {/* Optional on purpose: the CBU is the field nobody has to hand, and locking
                someone out of the app over it just moves the problem to a WhatsApp. */}
            <p className="type-caption fg-subtle">
              Datos bancarios — opcionales, los podés cargar después desde tu perfil.
            </p>
            <ProfileInput
              idPrefix={profileId}
              field="bankName"
              label="Banco"
              value={profile.bankName ?? ''}
              onChange={setProfileField}
            />
            <ProfileInput
              idPrefix={profileId}
              field="accountHolder"
              label="Titular de la cuenta"
              value={profile.accountHolder ?? ''}
              onChange={setProfileField}
            />
            <ProfileInput
              idPrefix={profileId}
              field="cbuOrCvu"
              label="CBU / CVU"
              value={profile.cbuOrCvu ?? ''}
              onChange={setProfileField}
            />
            <ProfileInput
              idPrefix={profileId}
              field="bankAlias"
              label="Alias"
              value={profile.bankAlias ?? ''}
              onChange={setProfileField}
            />
            {error ? (
              <p className="type-body-2 fg-danger" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-4">
            <Button
              type="submit"
              variant="solid"
              color="primary"
              fullWidth
              disabled={pending}
              data-loading={pending ? 'true' : undefined}
            >
              {pending ? 'Guardando…' : 'Terminar'}
            </Button>
            <button
              type="button"
              onClick={back}
              className="self-center rounded-control type-body-2 fg-subtle outline-none transition-colors hover:fg-default focus-visible:ring-2 focus-visible:ring-focus"
            >
              Volver
            </button>
          </div>
        </form>
      </AuthSplitLayout>
    )
  }

  return (
    <AuthSplitLayout
      title={firstName ? `Hola, ${firstName}` : 'Creá tu contraseña'}
      subtitle="Elegí una contraseña para entrar a tu cuenta."
    >
      <form className="flex flex-col gap-8" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={passwordId} className="type-button fg-default">
              Contraseña
            </label>
            <Input
              id={passwordId}
              name="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
              required
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={confirmId} className="type-button fg-default">
              Repetir contraseña
            </label>
            <Input
              id={confirmId}
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          </div>
          {error ? (
            <p className="type-body-2 fg-danger" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <Button
            type="submit"
            variant="solid"
            color="primary"
            fullWidth
            disabled={pending}
            data-loading={pending ? 'true' : undefined}
          >
            {pending ? 'Guardando…' : needsProfile ? 'Continuar' : 'Crear contraseña'}
          </Button>
          <Link
            to="/login"
            className="self-center rounded-control type-body-2 fg-subtle outline-none transition-colors hover:fg-default focus-visible:ring-2 focus-visible:ring-focus"
          >
            Volver a iniciar sesión
          </Link>
        </div>
      </form>
    </AuthSplitLayout>
  )
}
