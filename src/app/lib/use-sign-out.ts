import { useCallback } from 'react'
import { useNavigate } from 'react-router'

import { useAuth } from './auth-store'

export function useSignOut(): () => void {
  const navigate = useNavigate()
  const { logout } = useAuth()

  return useCallback(() => {
    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])
}
