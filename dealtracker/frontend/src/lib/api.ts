export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD'])

// The ONLY way the app talks to the backend: same-origin /api paths, first-party cookies.
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith('/api/')) throw new Error(`api() only calls same-origin /api paths, got ${path}`)
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (!SAFE_METHODS.has(method)) headers.set('X-Requested-With', 'dealtracker')
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const res = await fetch(path, { ...init, method, headers, credentials: 'same-origin' })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'http_error', data?.error?.message ?? res.statusText)
  }
  return data as T
}

export const isUnauthorized = (e: unknown) => e instanceof ApiError && e.status === 401
