import { useCallback, useState, type FormEvent } from 'react'

import { authApi } from '@/api/auth'

/**
 * Forgot-password request state + submit handler for the pre-auth
 * `/recuperar-contrasena` surface. The submit is enumeration-safe: it fires a
 * best-effort `authApi.requestPasswordReset` and ALWAYS resolves to the same neutral
 * confirmation, never revealing whether the email maps to an account.
 *
 * `POST /auth/forgot-password` is live and enumeration-safe (always 204). A network error
 * is still swallowed into the same neutral confirmation, so the surface never reveals
 * whether the email maps to an account regardless of what the server does.
 */
export interface ForgotPasswordForm {
  email: string
  setEmail: (value: string) => void
  pending: boolean
  submitted: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  reset: () => void
}

export function useForgotPasswordForm(): ForgotPasswordForm {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setPending(true)
      try {
        await authApi.requestPasswordReset(email)
      } catch {
        // Enumeration-safe: never surface whether the account exists (or that the
        // endpoint is not wired yet). Fall through to the same confirmation.
      }
      setPending(false)
      setSubmitted(true)
    },
    [email],
  )

  const reset = useCallback(() => {
    setSubmitted(false)
    setEmail('')
  }, [])

  return { email, setEmail, pending, submitted, onSubmit, reset }
}
