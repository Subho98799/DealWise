import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, isUnauthorized } from './api'
import { local, wipeLocal } from '../data/db'
import { engine } from '../sync/engine'
import { safeReturnPath } from './returnPath'
import type { Me } from '../data/types'

export type { Me }
export const ME_KEY = ['me'] as const

/** Last known user, read synchronously so a returning user never waits for the server. */
export function cachedMe(): Me | undefined {
  const cached = local.get('me')
  if (!cached) return undefined
  try {
    return JSON.parse(cached) as Me
  } catch {
    local.remove('me')
    return undefined
  }
}

/** /api/me, with a cached copy so the app opens offline. A 401 clears the cache and means "logged out". */
export async function fetchMe(): Promise<Me> {
  try {
    const me = await api<Me>('/api/me', { timeoutMs: 70_000 })
    local.set('me', JSON.stringify(me))
    return me
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 401) local.remove('me')
      throw e
    }
    const cached = cachedMe()
    if (cached) return cached
    throw e
  }
}

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    initialData: cachedMe,
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60 * 1000,
    retry: (count, err) => !isUnauthorized(err) && count < 3,
    retryDelay: (n) => Math.min(2000 * 2 ** n, 15000),
  })
}

export function googleLoginHref(next = '/') {
  return `/api/auth/google/login?next=${encodeURIComponent(safeReturnPath(next))}`
}

/** Stops sync and deletes ALL local data, then leaves for /login. */
export async function signOutLocally() {
  engine.stop()
  await wipeLocal()
  window.location.assign('/login')
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/api/auth/logout', { method: 'POST', timeoutMs: 20_000 }),
    onSuccess: async () => { qc.clear(); await signOutLocally() },
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/api/me', { method: 'DELETE' }),
    onSuccess: async () => { qc.clear(); await signOutLocally() },
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<Pick<Me, 'alert_days' | 'timezone'>>) => api<Me>('/api/me/settings', { method: 'PATCH', json: body }),
    onSuccess: (me) => { local.set('me', JSON.stringify(me)); qc.setQueryData(ME_KEY, me) },
  })
}
