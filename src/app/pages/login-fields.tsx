import { useId, useState } from 'react'
import { Link } from 'react-router'

import { AFFORDANCE } from '@/app/lib/icon-registry'
import { Button, Checkbox, IconButton, Input } from '@/app/components/components'
import { useLoginForm } from './use-login-form'

export function LoginFields() {
  const { email, setEmail, password, setPassword, remember, setRemember, pending, error, onSubmit } =
    useLoginForm()
  const [showPassword, setShowPassword] = useState(false)
  const emailId = useId()
  const passwordId = useId()
  const rememberId = useId()
  const invalid = error != null || undefined

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-4">
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
            aria-invalid={invalid}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={passwordId} className="type-button fg-default">
            Contraseña
          </label>
          <Input
            id={passwordId}
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            aria-invalid={invalid}
            trailingAction={
              <IconButton
                variant="transparent"
                size="dense"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? (
                  <AFFORDANCE.hidePassword className="size-4" aria-hidden />
                ) : (
                  <AFFORDANCE.revealPassword className="size-4" aria-hidden />
                )}
              </IconButton>
            }
          />
          <Link
            to="/recuperar-contrasena"
            className="self-start rounded-control type-body-2 fg-subtle outline-none transition-colors hover:fg-default focus-visible:ring-2 focus-visible:ring-focus"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id={rememberId}
            checked={remember}
            onCheckedChange={(value) => setRemember(value === true)}
          />
          <label htmlFor={rememberId} className="type-button fg-default">
            Recordarme
          </label>
        </div>

        {error ? (
          <p role="alert" className="type-body-2 fg-danger">
            {error}
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        variant="solid"
        color="primary"
        fullWidth
        disabled={pending}
        data-loading={pending ? 'true' : undefined}
      >
        {pending ? 'Ingresando…' : 'Iniciar sesión'}
      </Button>
    </form>
  )
}
