import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { authApi, type InvitedProfile } from '@/api/auth'

/**
 * Set-password (invitation acceptance) state + submit for the pre-auth
 * `/aceptar-invitacion` surface. The token comes from the emailed one-time link
 * (read from the URL by the page and passed in). On success the account is
 * activated and the page sends the person to `/login`; a missing / used / expired
 * token surfaces a single neutral error.
 *
 * Two steps, not two screens: the person picks a password, then completes the ficha only
 * they can fill in (phone, CUIT, bank). The second step appears ONLY when the server says
 * `needsProfile` — a password RESET runs through this same route, and marching somebody
 * recovering their password back through onboarding would be wrong. Both steps commit in a
 * single request, so a half-finished person never exists.
 */
export const MIN_PASSWORD_LENGTH = 8

/** Which fields the person cannot skip. The bank is deliberately absent: the CBU is the
 *  field people do not have to hand, and locking somebody out of the app over it just moves
 *  the problem to a WhatsApp message. It stays visible, and its absence is flagged on the
 *  ficha until it is filled in. */
export const REQUIRED_PROFILE_FIELDS = ['phone', 'taxId'] as const

export type ProfileField = keyof InvitedProfile
export type AcceptStep = 'password' | 'profile'

export interface AcceptInvitationForm {
  password: string
  setPassword: (value: string) => void
  confirm: string
  setConfirm: (value: string) => void
  /** Null while the preview is still loading, so the page can hold the step back rather
   *  than flashing a form it may not need. */
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

  // Ask what this link is for. A failure here is NOT surfaced: the token may still be
  // perfectly good, and the accept call below is the one that decides. Treating a preview
  // outage as "your link is broken" would turn a blip into a support call.
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
      // The preview decides whether a second step exists. Submitting while it is still in
      // flight would consume the single-use token and skip the ficha for good, so the answer
      // is waited for rather than assumed. `null` is "not known yet", not "no".
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
        // Nothing is sent yet: the two steps commit together, so the password is held here
        // until the ficha is filled in (or there is no ficha to fill).
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
