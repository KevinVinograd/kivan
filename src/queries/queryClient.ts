import { QueryClient } from '@tanstack/react-query'
import { ZodError } from 'zod'
import { ApiError } from '@/api/client'

/**
 * Single shared QueryClient. Don't retry 4xx; retry transient network/5xx.
 * A ZodError means the response body failed boundary validation (contract drift) —
 * that is deterministic, so retrying only re-hits an already-misbehaving endpoint.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
        // Contract drift (a failed response-schema parse) will fail identically on
        // every attempt — treat it as non-retryable like a 4xx.
        if (error instanceof ZodError) return false
        return failureCount < 2
      },
    },
    mutations: { retry: false },
  },
})
