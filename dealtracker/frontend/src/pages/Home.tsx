import { Avatar } from '../components/Avatar'
import { useMe } from '../lib/auth'

export default function HomePage() {
  const { data: me } = useMe()
  if (!me) return null
  const firstName = me.name?.split(' ')[0] ?? 'there'

  return (
    <div data-testid="home-page" className="space-y-8">
      <header className="rise flex items-center gap-4">
        <Avatar name={me.name} url={me.avatar_url} />
        <div className="min-w-0">
          <p className="text-sm text-muted">Welcome back</p>
          <h1 data-testid="home-user-name" className="truncate text-2xl font-extrabold tracking-tight">
            {firstName}
          </h1>
        </div>
      </header>

      <section
        data-testid="home-phase-placeholder"
        className="rise rounded-lg border border-dashed border-line bg-surface p-6 shadow-card"
        style={{ animationDelay: '80ms' }}
      >
        <span className="inline-block rounded-pill bg-accent px-3 py-1 text-xs font-bold text-[#17201d]">Coming soon</span>
        <h2 className="mt-4 text-base font-bold md:text-lg">Deals coming in Phase 2</h2>
        <p className="mt-2 text-sm text-muted">
          Quick-add deals, track refunds in ₹, mediators and review deadlines, even offline.
        </p>
      </section>
    </div>
  )
}
