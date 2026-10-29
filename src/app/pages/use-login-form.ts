import { useCallback, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { ApiError } from '@/api/client'
import { useAuth } from '@/app/lib/auth-store'

export interface LoginForm {
  email: string
  setEmail: (value: string) => void
  password: string
  setPassword: (value: string) => void
  remember: boolean
  setRemember: (value: boolean) => void
  pending: boolean
  error: string | null
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function useLoginForm(): LoginForm {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setError(null)
      setPending(true)
      try {
        await login(email, password, remember)
        navigate('/dashboard', { replace: true })
      } catch (cause) {
        const message =
          cause instanceof ApiError && cause.status === 401
            ? 'Correo o contraseña incorrectos.'
            : 'No pudimos iniciar sesión. Intentá de nuevo.'
        setError(message)
        setPending(false)
      }
    },
    [email, password, remember, login, navigate],
  )

  return { email, setEmail, password, setPassword, remember, setRemember, pending, error, onSubmit }
}
