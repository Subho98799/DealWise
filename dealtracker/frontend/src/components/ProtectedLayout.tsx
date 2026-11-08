import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { isUnauthorized } from '../lib/api'
import { useMe } from '../lib/auth'
import { BottomNav } from './BottomNav'
import { Splash } from './Splash'

export function ProtectedLayout() {
  const me = useMe()
  const location = useLocation()

  if (me.isPending) return <Splash message="Waking up the server…" hint="The first load can take up to a minute." />
  if (me.isError) {
    if (isUnauthorized(me.error)) {
      const next = location.pathname + location.search
      return <Navigate to="/login" replace state={{ next }} />
    }
    return (
      <Splash
        message="Can't reach DealTracker right now."
        hint="Check your connection and try again."
        action={{ label: 'Try again', onClick: () => me.refetch() }}
      />
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex-1 px-gutter pb-[calc(var(--nav-height)+env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+20px)]">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
