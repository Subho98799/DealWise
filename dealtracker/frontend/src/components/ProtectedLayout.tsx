import { useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { isUnauthorized } from '../lib/api'
import { ME_KEY, useMe } from '../lib/auth'
import { openFor } from '../data/db'
import { UserContext, useDeals } from '../data/hooks'
import { evaluate } from '../lib/rules'
import { todayIn } from '../lib/dates'
import { engine } from '../sync/engine'
import { BottomNav } from './BottomNav'
import { Splash } from './Splash'
import { SyncChip } from './SyncChip'
import { ToastProvider, useToast } from './Toast'
import type { Me } from '../data/types'

export function ProtectedLayout() {
  const me = useMe()
  const location = useLocation()
  const qc = useQueryClient()
  const [readyFor, setReadyFor] = useState<string | null>(null)
  const uid = me.data?.id

  useEffect(() => {
    if (!uid) return
    let alive = true
    engine.onUnauthorized = () => void qc.invalidateQueries({ queryKey: ME_KEY })
    void openFor(uid).then(() => { if (alive) { setReadyFor(uid); engine.start() } })
    return () => { alive = false; engine.stop() }
  }, [uid, qc])

  if (me.isPending) return <Splash message="Waking up the server…" hint="The first load can take up to a minute." />
  if (me.isError) {
    if (isUnauthorized(me.error)) return <Navigate to="/login" replace state={{ next: location.pathname + location.search }} />
    return <Splash message="Can't reach the server right now." hint="Check your connection and try again."
      action={{ label: 'Try again', onClick: () => me.refetch() }} />
  }
  if (readyFor !== uid) return <Splash message="Opening your deals…" />
  return <Shell me={me.data} />
}

function Shell({ me }: { me: Me }) {
  const deals = useDeals()
  const alertCount = useMemo(() => {
    const today = todayIn(me.timezone)
    return (deals ?? []).filter((d) => evaluate(d, today, me.alert_days).isUrgent).length
  }, [deals, me.timezone, me.alert_days])

  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (alertCount) void nav.setAppBadge?.(alertCount).catch(() => {})
    else void nav.clearAppBadge?.().catch(() => {})
  }, [alertCount])

  return (
    <UserContext.Provider value={me}>
      <ToastProvider>
        <SyncConflictNotices />
        <div className="mx-auto flex min-h-dvh max-w-md flex-col">
          <header className="safe-top sticky top-0 z-10 flex items-center justify-end bg-bg/90 px-gutter py-2 backdrop-blur-md">
            <SyncChip />
          </header>
          <main className="flex-1 px-gutter pb-[calc(var(--nav-height)+env(safe-area-inset-bottom)+32px)] pt-2">
            <Outlet />
          </main>
          <BottomNav alertCount={alertCount} />
        </div>
      </ToastProvider>
    </UserContext.Provider>
  )
}

function SyncConflictNotices() {
  const toast = useToast()
  useEffect(() => engine.subscribeSuperseded(({ product, dealId }) => toast({
    message: `Your edit to ${product} was replaced by a newer version`,
    link: { label: 'View deal', to: `/deals/${dealId}` },
  })), [toast])
  return null
}
