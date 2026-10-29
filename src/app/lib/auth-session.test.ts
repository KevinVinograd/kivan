import { describe, expect, it } from 'vitest'

import { deriveAuthSession, deriveMeStatus, type AuthSessionInput } from './auth-session'

describe('deriveMeStatus', () => {
  it('reports `disabled` only when the query never ran', () => {
    expect(deriveMeStatus({ hasToken: false, isSuccess: false, isError: false })).toBe('disabled')
  })

  it('reports `pending` while a held token is being checked', () => {
    expect(deriveMeStatus({ hasToken: true, isSuccess: false, isError: false })).toBe('pending')
  })

  it('lets a settled outcome outrank token presence', () => {
    expect(deriveMeStatus({ hasToken: true, isSuccess: true, isError: false })).toBe('success')
    expect(deriveMeStatus({ hasToken: true, isSuccess: false, isError: true })).toBe('error')
  })

  it('still surfaces the error after the api client cleared the dead token', () => {
    expect(deriveMeStatus({ hasToken: false, isSuccess: false, isError: true })).toBe('error')
  })

  it('still surfaces a resolved session after a logout cleared the token', () => {
    expect(deriveMeStatus({ hasToken: false, isSuccess: true, isError: false })).toBe('success')
  })
})

function input(overrides: Partial<AuthSessionInput> = {}): AuthSessionInput {
  return {
    bootstrapConfigured: false,
    hadTokenAtMount: true,
    hasSessionUser: true,
    meStatus: 'success',
    meIsFetching: false,
    bootstrapStatus: 'idle',
    ...overrides,
  }
}

describe('deriveAuthSession — production (no dev bootstrap configured)', () => {
  it('never starts a bootstrap, whatever the session looks like', () => {
    for (const meStatus of ['disabled', 'pending', 'success', 'error'] as const) {
      expect(
        deriveAuthSession(input({ meStatus, hadTokenAtMount: false })).shouldStartBootstrap,
      ).toBe(false)
    }
  })

  it('is not loading when logged out, so RequireAuth can redirect to /login', () => {
    const state = deriveAuthSession(
      input({ hadTokenAtMount: false, hasSessionUser: false, meStatus: 'disabled' }),
    )
    expect(state.isLoading).toBe(false)
  })

  it('holds the splash while the stored session resolves, and releases it on success', () => {
    expect(
      deriveAuthSession(input({ hasSessionUser: false, meStatus: 'pending', meIsFetching: true }))
        .isLoading,
    ).toBe(true)
    expect(deriveAuthSession(input()).isLoading).toBe(false)
  })

  it('releases the splash on an errored session so the user reaches /login', () => {
    expect(deriveAuthSession(input({ hasSessionUser: false, meStatus: 'error' })).isLoading).toBe(
      false,
    )
  })
})

describe('deriveAuthSession — dev bootstrap, cold start (fresh port, no token)', () => {
  const cold = (overrides: Partial<AuthSessionInput> = {}) =>
    input({
      bootstrapConfigured: true,
      hadTokenAtMount: false,
      hasSessionUser: false,
      meStatus: 'disabled',
      ...overrides,
    })

  it('starts the bootstrap and holds the splash instead of redirecting to /login', () => {
    const state = deriveAuthSession(cold())
    expect(state.shouldStartBootstrap).toBe(true)
    expect(state.isLoading).toBe(true)
  })

  it('keeps holding while the login is in flight, and does not start a second one', () => {
    const state = deriveAuthSession(cold({ bootstrapStatus: 'running' }))
    expect(state.shouldStartBootstrap).toBe(false)
    expect(state.isLoading).toBe(true)
  })

  it('keeps holding after the login wins, until /auth/me actually answers', () => {
    expect(
      deriveAuthSession(
        cold({ bootstrapStatus: 'succeeded', meStatus: 'pending', meIsFetching: true }),
      ).isLoading,
    ).toBe(true)
  })

  it('releases once the session resolves', () => {
    const state = deriveAuthSession(
      cold({ bootstrapStatus: 'succeeded', hasSessionUser: true, meStatus: 'success' }),
    )
    expect(state.isLoading).toBe(false)
    expect(state.shouldStartBootstrap).toBe(false)
  })

  it('falls through to /login when the boot login fails — no retry', () => {
    const state = deriveAuthSession(cold({ bootstrapStatus: 'failed' }))
    expect(state.isLoading).toBe(false)
    expect(state.shouldStartBootstrap).toBe(false)
  })
})

describe('deriveAuthSession — dev bootstrap, expired session (token present but dead)', () => {
  const expired = (overrides: Partial<AuthSessionInput> = {}) =>
    input({
      bootstrapConfigured: true,
      hadTokenAtMount: true,
      hasSessionUser: false,
      ...overrides,
    })

  it('does not fire while the stored token is still being checked', () => {
    const state = deriveAuthSession(expired({ meStatus: 'pending', meIsFetching: true }))
    expect(state.shouldStartBootstrap).toBe(false)
    expect(state.isLoading).toBe(true)
  })

  it('fires once /auth/me errors — the refresh chain is dead, so log in again', () => {
    const state = deriveAuthSession(expired({ meStatus: 'error' }))
    expect(state.shouldStartBootstrap).toBe(true)
    expect(state.isLoading).toBe(true)
  })

  it('holds the splash through the recovery refetch, which react-query leaves in `error`', () => {
    const state = deriveAuthSession(
      expired({ bootstrapStatus: 'succeeded', meStatus: 'error', meIsFetching: true }),
    )
    expect(state.isLoading).toBe(true)
  })

  it('gives up to /login when the recovery refetch also fails', () => {
    const state = deriveAuthSession(
      expired({ bootstrapStatus: 'succeeded', meStatus: 'error', meIsFetching: false }),
    )
    expect(state.isLoading).toBe(false)
    expect(state.shouldStartBootstrap).toBe(false)
  })

  it('recovers into an authenticated session', () => {
    const state = deriveAuthSession(
      expired({ bootstrapStatus: 'succeeded', hasSessionUser: true, meStatus: 'success' }),
    )
    expect(state.isLoading).toBe(false)
  })
})

describe('deriveAuthSession — the boot login is strictly one-shot', () => {
  it.each(['running', 'succeeded', 'failed'] as const)(
    'never re-fires once the bootstrap is %s, even on an errored session',
    (bootstrapStatus) => {
      expect(
        deriveAuthSession(
          input({
            bootstrapConfigured: true,
            hadTokenAtMount: false,
            hasSessionUser: false,
            meStatus: 'error',
            bootstrapStatus,
          }),
        ).shouldStartBootstrap,
      ).toBe(false)
    },
  )

  it('does not log the user back in after an explicit logout', () => {
    const state = deriveAuthSession(
      input({
        bootstrapConfigured: true,
        hadTokenAtMount: false,
        hasSessionUser: false,
        meStatus: 'disabled',
        bootstrapStatus: 'succeeded',
      }),
    )
    expect(state.shouldStartBootstrap).toBe(false)
    expect(state.isLoading).toBe(false)
  })
})

describe('deriveAuthSession — a request in flight with no user is UNDECIDED', () => {
  it('holds the splash while the api client is mid-recovery, token already cleared', () => {
    const state = deriveAuthSession(
      input({
        bootstrapConfigured: true,
        hadTokenAtMount: true,
        hasSessionUser: false,
        meStatus: 'disabled',
        meIsFetching: true,
      }),
    )
    expect(state.isLoading).toBe(true)
  })

  it('holds the splash while a re-login refetch runs over the null logout wrote', () => {
    const state = deriveAuthSession(
      input({ hasSessionUser: false, meStatus: 'success', meIsFetching: true }),
    )
    expect(state.isLoading).toBe(true)
  })

  it('releases as soon as that refetch settles with a user', () => {
    const state = deriveAuthSession(
      input({ hasSessionUser: true, meStatus: 'success', meIsFetching: false }),
    )
    expect(state.isLoading).toBe(false)
  })

  it('does not hold on an idle query that was never enabled', () => {
    const state = deriveAuthSession(
      input({ hasSessionUser: false, meStatus: 'disabled', meIsFetching: false }),
    )
    expect(state.isLoading).toBe(false)
  })
})
