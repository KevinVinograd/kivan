/**
 * Auth session state machine — the pure decision layer behind `auth-store.tsx`.
 *
 * Extracted so CI can pin it. The provider's session logic encodes several
 * non-obvious invariants that are easy to break by accident and impossible to
 * unit-test from inside React here (the `unit` Vitest project is node-only, with
 * no DOM). Keeping the decision pure moves it within reach of a plain test.
 *
 * The invariants, each learned from a real failure:
 *
 *  - **A DISABLED react-query reports `isLoading: false`.** Deriving "ready" from
 *    it makes `RequireAuth` see "not loading, not authenticated" and redirect to
 *    `/login` before `/auth/me` was ever requested.
 *  - **After an error, react-query keeps `status: 'error'` for the whole refetch**
 *    and never re-enters `pending`. On the
 *    expired-session recovery path, `isFetching` is therefore the ONLY signal that
 *    the retry is in flight.
 *  - **The boot login fires at most once per page load.** A retry loop on a bad
 *    credential would hammer the API, and re-firing after an explicit logout would
 *    make the login page unreachable.
 *  - **Holding a token with no user and a request in flight means UNDECIDED.** The
 *    query can sit in `success` with `data: null` (logout writes that) while a
 *    re-login refetch is running — "success" there does not mean "resolved".
 */

/** The `/auth/me` query as the provider sees it. */
export type MeStatus = 'disabled' | 'pending' | 'success' | 'error'

/** Lifecycle of the one-shot dev boot login. */
export type BootstrapStatus = 'idle' | 'running' | 'succeeded' | 'failed'

export interface AuthSessionInput {
  /** Dev auto-login is configured for this page load. Always false in production. */
  readonly bootstrapConfigured: boolean
  /** A token was already in storage when the provider mounted. */
  readonly hadTokenAtMount: boolean
  /** `/auth/me` has resolved to a real user. */
  readonly hasSessionUser: boolean
  readonly meStatus: MeStatus
  /** `/auth/me` has a request in flight — the initial load OR a refetch. */
  readonly meIsFetching: boolean
  readonly bootstrapStatus: BootstrapStatus
}

export interface AuthSessionState {
  /** Fire the one-shot boot login now. */
  readonly shouldStartBootstrap: boolean
  /** Hold the `RequireAuth` splash: the session is not decided yet. */
  readonly isLoading: boolean
}

/**
 * Collapse the `/auth/me` query into one status.
 *
 * The precedence is the whole point. When the refresh chain is dead, the api client
 * clears the token from INSIDE the failing request — so by the time `/auth/me` rejects,
 * `hasToken` is already false. If the token won, that session would report `disabled`
 * and the error would be invisible. The expired-session bootstrap arm keys on exactly
 * that error, so a settled outcome always outranks token presence.
 */
export function deriveMeStatus(input: {
  readonly hasToken: boolean
  readonly isSuccess: boolean
  readonly isError: boolean
}): MeStatus {
  if (input.isSuccess) return 'success'
  if (input.isError) return 'error'
  return input.hasToken ? 'pending' : 'disabled'
}

export function deriveAuthSession(input: AuthSessionInput): AuthSessionState {
  const shouldStartBootstrap =
    input.bootstrapConfigured &&
    // One shot per page load. Any non-idle status means it already ran.
    input.bootstrapStatus === 'idle' &&
    // Cold start: nothing in storage on this origin — the case every fresh port hits.
    (!input.hadTokenAtMount ||
      // Expired session: a token WAS in storage, but `/auth/me` failed, which means
      // the refresh chain is dead too (the api client already tried to rotate it).
      // Without this arm the feature silently degrades to a manual login on exactly
      // the origin it exists to cover.
      input.meStatus === 'error')

  const bootstrapPending =
    shouldStartBootstrap ||
    input.bootstrapStatus === 'running' ||
    // The boot login won, but the session is not settled until `/auth/me` answers.
    // On the recovery path that query is still in `error` while it refetches, so the
    // status cannot prove the retry is live — only `isFetching` can.
    (input.bootstrapStatus === 'succeeded' &&
      (input.meStatus === 'pending' || input.meIsFetching))

  // A request in flight with no user yet is an UNDECIDED session — whatever the query
  // status says, and whatever the token says. Deliberately NOT conditioned on holding a
  // token, because both cases this catches occur while the token is absent or stale:
  //
  //  - Expiring session: the api client clears the dead token from INSIDE the failing
  //    `/auth/me` request. Mid-flight there is no token and the query has not settled, so
  //    a token-conditioned rule reads it as "resolved, anonymous" and bounces the user to
  //    /login for a beat before the recovery login lands. Measured: the redirect really
  //    did fire, and the user saw the login screen flash.
  //  - Logout then login again in one page load: the query still reports `success`,
  //    because its data is the `null` that logout wrote, while the re-login refetch runs.
  const sessionUnresolved = !input.hasSessionUser && input.meIsFetching

  return {
    shouldStartBootstrap,
    isLoading: bootstrapPending || input.meStatus === 'pending' || sessionUnresolved,
  }
}
