import { CSRF_HEADER, CSRF_HEADER_VALUE, REQUEST_TIMEOUT_MS } from '../config/app'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}
export class TimeoutError extends Error {}
export class NetworkError extends Error {}

const SAFE_METHODS = new Set(['GET', 'HEAD'])

type Init = RequestInit & { timeoutMs?: number; json?: unknown }

// The ONLY way the app talks to the backend: same-origin /api paths, first-party cookies.
export async function api<T>(path: string, init: Init = {}): Promise<T> {
  if (!path.startsWith('/api/')) throw new Error(`api() only calls same-origin /api paths, got ${path}`)
  const { timeoutMs = REQUEST_TIMEOUT_MS, json, ...rest } = init
  const method = (rest.method ?? 'GET').toUpperCase()
  const headers = new Headers(rest.headers)
  headers.set('Accept', 'application/json')
  if (!SAFE_METHODS.has(method)) headers.set(CSRF_HEADER, CSRF_HEADER_VALUE)
  const body = json !== undefined ? JSON.stringify(json) : rest.body
  if (body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(path, { ...rest, body, method, headers, credentials: 'same-origin', signal: ctrl.signal })
  } catch (e) {
    if (ctrl.signal.aborted) throw new TimeoutError('The server took too long to answer.')
    throw new NetworkError((e as Error).message)
  } finally {
    clearTimeout(timer)
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'http_error', data?.error?.message ?? res.statusText)
  }
  return data as T
}

export async function apiBlob(path: string): Promise<Blob> {
  if (!path.startsWith('/api/')) throw new Error(`apiBlob() only calls same-origin /api paths, got ${path}`)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(path, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'text/csv' },
      signal: ctrl.signal,
    })
  } catch (e) {
    if (ctrl.signal.aborted) throw new TimeoutError('The server took too long to answer.')
    throw new NetworkError((e as Error).message)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new ApiError(res.status, data?.error?.code ?? 'http_error', data?.error?.message ?? res.statusText)
  }
  return res.blob()
}

export const isUnauthorized = (e: unknown) => e instanceof ApiError && e.status === 401
