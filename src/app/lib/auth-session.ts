export type MeStatus = 'disabled' | 'pending' | 'success' | 'error'

export type BootstrapStatus = 'idle' | 'running' | 'succeeded' | 'failed'

export interface AuthSessionInput {
  readonly bootstrapConfigured: boolean
  readonly hadTokenAtMount: boolean
  readonly hasSessionUser: boolean
  readonly meStatus: MeStatus
  readonly meIsFetching: boolean
  readonly bootstrapStatus: BootstrapStatus
}

export interface AuthSessionState {
  readonly shouldStartBootstrap: boolean
  readonly isLoading: boolean
}

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
    input.bootstrapStatus === 'idle' &&
    (!input.hadTokenAtMount ||
      input.meStatus === 'error')

  const bootstrapPending =
    shouldStartBootstrap ||
    input.bootstrapStatus === 'running' ||
    (input.bootstrapStatus === 'succeeded' &&
      (input.meStatus === 'pending' || input.meIsFetching))

  const sessionUnresolved = !input.hasSessionUser && input.meIsFetching

  return {
    shouldStartBootstrap,
    isLoading: bootstrapPending || input.meStatus === 'pending' || sessionUnresolved,
  }
}
