import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { authApi, type InvitedProfile } from '@/api/auth'

export const MIN_PASSWORD_LENGTH = 8

export const REQUIRED_PROFILE_FIELDS = ['phone', 'taxId'] as const

export type ProfileField = keyof InvitedProfile
export type AcceptStep = 'password' | 'profile'

export interface AcceptInvitationForm {
  password: string
  setPassword: (value: string) => void
  confirm: string
  setConfirm: (value: string) => void
  needsProfile: boolean | null
  firstName: string | null
  step: AcceptStep
  profile: InvitedProfile
  setProfileField: (field: ProfileField, value: string) => void
  pending: boolean
  submitted: boolean
  error: string | null
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  back: () => void
}

export function useAcceptInvitationForm(token: string | null): AcceptInvitationForm {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [step, setStep] = useState<AcceptStep>('password')
  const [profile, setProfile] = useState<InvitedProfile>({})
  const [needsProfile, setNeedsProfile] = useState<boolean | null>(null)
  const [firstName, setFirstName] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setNeedsProfile(false)
      return
    }
    let cancelled = false
    authApi
      .invitationPreview(token)
      .then((preview) => {
        if (cancelled) return
        setNeedsProfile(preview.needsProfile)
        setFirstName(preview.firstName)
      })
      .catch(() => {
        if (!cancelled) setNeedsProfile(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const setProfileField = useCallback((field: ProfileField, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }))
  }, [])

  const back = useCallback(() => {
    setError(null)
    setStep('password')
  }, [])

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!token) {
        setError('El enlace no es válido.')
        return
      }
      if (needsProfile === null) {
        setError('Un segundo, estamos abriendo tu invitación.')
        return
      }
      if (step === 'password') {
        if (password.length < MIN_PASSWORD_LENGTH) {
          setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`)
          return
        }
        if (password !== confirm) {
          setError('Las contraseñas no coinciden.')
          return
        }
        setError(null)
        if (needsProfile) {
          setStep('profile')
          return
        }
      }
      if (step === 'profile') {
        const missing = REQUIRED_PROFILE_FIELDS.filter((field) => !profile[field]?.trim())
        if (missing.length > 0) {
          setError('Completá tu teléfono y tu CUIT/CUIL para continuar.')
          return
        }
      }
      setError(null)
      setPending(true)
      try {
        await authApi.acceptInvitation(token, password, needsProfile ? profile : undefined)
        setSubmitted(true)
      } catch {
        setError('El enlace no es válido o ya venció. Pedile uno nuevo a tu administrador.')
      } finally {
        setPending(false)
      }
    },
    [token, password, confirm, step, needsProfile, profile],
  )

  return {
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
  }
}
