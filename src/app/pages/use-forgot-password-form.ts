import { useCallback, useState, type FormEvent } from 'react'

import { authApi } from '@/api/auth'

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
