import type { ZodType } from 'zod'
import { env } from '@/lib/env'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './token'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface RequestOptions {
  readonly params?: Record<string, string | number | undefined>
  readonly body?: unknown
  readonly signal?: AbortSignal
  readonly _retried?: boolean
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const url = new URL(`${env.apiUrl}${path}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    const text = await response.text()
    return text.length > 0 ? text : null
  }
  return (await response.json()) as unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  try {
    const res = await fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) {
      clearTokens()
      return false
    }
    const data = (await res.json()) as { accessToken: string; refreshToken: string }
    setTokens(data.accessToken, data.refreshToken)
    return true
  } catch {
    return false
  }
}

let refreshInFlight: Promise<boolean> | null = null

function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

export type ApiWriteListener = (write: { method: string; path: string }) => void

const writeListeners = new Set<ApiWriteListener>()

export function onApiWrite(listener: ApiWriteListener): () => void {
  writeListeners.add(listener)
  return () => writeListeners.delete(listener)
}

function announceWrite(method: string, path: string): void {
  if (method === 'GET') return
  for (const listener of writeListeners) {
    try {
      listener({ method, path })
    } catch {
    }
  }
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions & { schema?: ZodType<T> } = {},
): Promise<T> {
  const { params, body, signal } = options
  const accessToken = getAccessToken()

  let response: Response
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    })
  } catch (cause) {
    throw new ApiError(0, 'Network request failed', cause)
  }

  if (response.status === 401 && !options._retried && (await tryRefresh())) {
    return request<T>(method, path, { ...options, _retried: true })
  }

  const parsed = await parseBody(response)
  if (!response.ok) {
    const message =
      isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.message === 'string'
        ? parsed.error.message
        : `Request failed with status ${response.status}`
    throw new ApiError(response.status, message, parsed)
  }
  announceWrite(method, path)
  return options.schema ? options.schema.parse(parsed) : (parsed as T)
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'> & { schema?: ZodType<T> }) =>
    request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions & { schema?: ZodType<T> }) =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body: unknown, options?: RequestOptions & { schema?: ZodType<T> }) =>
    request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body: unknown, options?: RequestOptions & { schema?: ZodType<T> }) =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions & { schema?: ZodType<T> }) =>
    request<T>('DELETE', path, options),
}
