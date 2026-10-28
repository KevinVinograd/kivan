import { useId } from 'react'
import { Link, Navigate } from 'react-router'

import { Button, Input } from '@/app/components/components'
import { useAuth } from '@/app/lib/auth-store'
import { AuthSplitLayout } from './auth-split-layout'
import { useForgotPasswordForm } from './use-forgot-password-form'

/**
 * Recuperar contraseña — the pre-auth password-reset *request* surface (route
 * `/recuperar-contrasena`), rendered outside the AppShell and reached from the
 * "¿Olvidaste tu contraseña?" trigger on `/login`. Reuses `AuthSplitLayout`.
 *
 * Front-end only for now: the submit is enumeration-safe (see `useForgotPasswordForm`)
 * and always lands on the same neutral confirmation. An already-signed-in visitor is
 * bounced to `/dashboard`.
 */
export function ForgotPasswordPage() {
  const { isAuthenticated } = useAuth()
  const { email, setEmail, pending, submitted, onSubmit, reset } = useForgotPasswordForm()
  const emailId = useId()

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  if (submitted) {
    return (
      <AuthSplitLayout title="Revisá tu correo">
        <div className="flex flex-col gap-6">
          <p className="type-body-2 fg-subtle">
            Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu
            contraseña.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              to="/login"
              className="self-start rounded-control type-body-2 fg-subtle outline-none transition-colors hover:fg-default focus-visible:ring-2 focus-visible:ring-focus"
            >
              Volver a iniciar sesión
            </Link>
            <button
              type="button"
              onClick={reset}
              className="self-start rounded-control type-body-2 fg-subtle outline-none transition-colors hover:fg-default focus-visible:ring-2 focus-visible:ring-focus"
            >
              Probar con otro correo
            </button>
          </div>
        </div>
      </AuthSplitLayout>
    )
  }

  return (
    <AuthSplitLayout
      title="Recuperar contraseña"
      subtitle="Ingresá tu correo y te enviamos un enlace para restablecerla."
    >
      <form className="flex flex-col gap-8" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={emailId} className="type-button fg-default">
            Correo electrónico
          </label>
          <Input
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
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
            {pending ? 'Enviando…' : 'Enviar enlace'}
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
