import { useCallback } from 'react'
import { useNavigate } from 'react-router'

import { useAuth } from './auth-store'

/**
 * End the session and return to the pre-auth surface.
 *
 * One behaviour for both entry points — the rail's avatar menu and the button at the
 * bottom of Configuración → Mi perfil. They used to be one call site, so the pair
 * lived inline there; a second caller is exactly when that stops being safe, because
 * two hand-written copies drift and the one nobody looks at is the one that forgets
 * to navigate.
 *
 * `logout()` clears the token pair, evicts every non-auth query and revokes the
 * refresh token server-side. `RequireAuth` would bounce to /login on its own once the
 * session clears — the explicit navigate makes the hand-off immediate instead of
 * waiting for a render pass, and `replace` keeps the signed-in page out of history so
 * Back cannot return to it.
 */
export function useSignOut(): () => void {
  const navigate = useNavigate()
  const { logout } = useAuth()

  return useCallback(() => {
    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])
}
