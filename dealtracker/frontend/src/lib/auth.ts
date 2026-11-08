import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isUnauthorized } from './api'

export type Me = {
  id: string
  name: string | null
  email: string
  avatar_url: string | null
  role: 'user' | 'admin'
}

export const ME_KEY = ['me'] as const

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => api<Me>('/api/me'),
    staleTime: 5 * 60 * 1000,
    // A 401 is an answer (logged out), not a failure worth retrying. Other errors may be a cold start.
    retry: (count, err) => !isUnauthorized(err) && count < 3,
    retryDelay: (n) => Math.min(2000 * 2 ** n, 15000),
  })
}

export function googleLoginHref(next = '/') {
  return `/api/auth/google/login?next=${encodeURIComponent(next)}`
}

function useSignedOut() {
  const qc = useQueryClient()
  return () => {
    qc.clear()
    window.location.assign('/login')
  }
}

export function useLogout() {
  const signedOut = useSignedOut()
  return useMutation({
    mutationFn: () => api<void>('/api/auth/logout', { method: 'POST' }),
    onSuccess: signedOut,
  })
}

export function useDeleteAccount() {
  const signedOut = useSignedOut()
  return useMutation({
    mutationFn: () => api<void>('/api/me', { method: 'DELETE' }),
    onSuccess: signedOut,
  })
}
