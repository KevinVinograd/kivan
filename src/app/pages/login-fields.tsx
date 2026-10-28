import { useId, useState } from 'react'
import { Link } from 'react-router'

import { AFFORDANCE } from '@/app/lib/icon-registry'
import { Button, Checkbox, IconButton, Input } from '@/app/components/components'
import { useLoginForm } from './use-login-form'

/**
 * Shared sign-in form body for the /login split. It sits on the solid surface of
 * the right panel, so it uses the default fg tokens and a primary submit. The
 * password reveal is an icon toggle handed to Input's `trailingAction` slot —
 * the slot owns the positioning and the `bg-control` fill that masks a long
 * value, so no padding override lands on the primitive. "Recordarme" chooses token
 * persistence: on → survives a browser restart, off → session-only (see api/token.ts).
 *
 * "¿Olvidaste tu contraseña?" sits under the password field, as its helper line.
 * It keeps `type-body-2` rather than dropping to `type-caption`: the page-context
 * ranks it Secondary and the reveal toggle Tertiary, so shrinking it would leave
 * it reading smaller than something less important. Placement demotes it; size
 * does not.
 *
 * Vertical rhythm: 32px (gap-8) between the field group and the submit button; the
 * title-to-fields 32px gap is owned by the host column.
 */
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
                {/* `size-4` is explicit: Phosphor defaults to `1em`, and IconButton's
                    `type-button` is 14px — so an unsized glyph renders at 14px, off the
                    product's 16px icon convention. Every other icon call-site sizes itself. */}
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
