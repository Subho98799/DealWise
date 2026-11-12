import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
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
import { Avatar } from './Avatar'
import { AppLogo } from './AppLogo'
import { Skeleton } from './ui'
import type { Me } from '../data/types'
import { APP_NAME } from '../config/app'
import DealFormPage from '../pages/DealForm'

export function ProtectedLayout({ quickAddModal = false }: { quickAddModal?: boolean }) {
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

  if (me.isError && isUnauthorized(me.error)) return <Navigate to="/login" replace state={{ next: location.pathname + location.search }} />
  if (me.isPending) return <Splash message="Waking up the server…" hint="The first load can take up to a minute." />
  if (me.isError && !me.data) {
    return <Splash message="Can't reach the server right now." hint="Check your connection and try again."
      action={{ label: 'Try again', onClick: () => me.refetch() }} />
  }
  if (!me.data) return <Splash message="Opening your deals…" />
  if (readyFor !== uid) return <Booting me={me.data} />
  return <Shell me={me.data} quickAddModal={quickAddModal} />
}

function Booting({ me }: { me: Me }) {
  return (
    <div className="app-stage min-h-dvh">
      <div className="app-frame mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
        <header className="app-topbar safe-top sticky top-0 z-10 px-gutter py-2">
          <span className="app-wordmark"><AppLogo size={30} /><span>{APP_NAME}</span></span>
          <SyncChip />
          <span className="account-avatar-link"><Avatar name={me.name} url={me.avatar_url} size={38} /></span>
        </header>
        <main className="flex-1 px-gutter pt-3"><Skeleton rows={4} /></main>
      </div>
    </div>
  )
}

function Shell({ me, quickAddModal }: { me: Me; quickAddModal: boolean }) {
  const location = useLocation()
  const navigate = useNavigate()
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
        <div className="app-stage min-h-dvh">
        <div className="app-frame mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
          <header className="app-topbar safe-top sticky top-0 z-10 px-gutter py-2">
            <Link to="/" aria-label={`${APP_NAME} home`} className="app-wordmark"><AppLogo size={30} /><span>{APP_NAME}</span></Link>
            <SyncChip />
            <Link to="/settings" className="account-avatar-link" aria-label="Account and settings">
              <Avatar name={me.name} url={me.avatar_url} size={38} />
            </Link>
          </header>
          <main className="flex-1 px-gutter pb-[calc(var(--nav-height)+env(safe-area-inset-bottom)+24px)] pt-3">
            <div key={location.pathname} className="page-transition"><Outlet /></div>
          </main>
          <BottomNav alertCount={alertCount} />
        </div>
        {quickAddModal && <DealFormPage modal onClose={() => navigate(-1)} />}
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
