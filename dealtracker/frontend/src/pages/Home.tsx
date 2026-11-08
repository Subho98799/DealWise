import { Link } from 'react-router-dom'
import { useDeals, useSummary, useToday, useUser } from '../data/hooks'
import { DealCard } from '../components/DealCard'
import { Empty, Skeleton } from '../components/ui'
import { Avatar } from '../components/Avatar'
import { evaluate, sortDeals } from '../lib/rules'
import { formatINR } from '../lib/money'

function Card({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-card">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p data-testid={testId} className="mt-1 text-lg font-extrabold tracking-tight">{value}</p>
    </div>
  )
}

export default function HomePage() {
  const me = useUser()
  const today = useToday()
  const deals = useDeals()
  const s = useSummary(deals)
  const urgent = deals ? sortDeals(deals.filter((d) => evaluate(d, today, me.alert_days).isUrgent), 'urgency') : []
  const recent = deals ? sortDeals(deals, 'newest').slice(0, 5) : []

  return (
    <div data-testid="home-page" className="space-y-6">
      <header className="flex items-center gap-3">
        <Avatar name={me.name} url={me.avatar_url} size={44} />
        <div className="min-w-0">
          <p className="text-xs text-muted">Welcome back</p>
          <h1 data-testid="home-user-name" className="truncate text-xl font-extrabold">{me.name?.split(' ')[0] ?? 'there'}</h1>
        </div>
      </header>

      {!s ? <Skeleton rows={2} /> : (
        <section className="grid grid-cols-2 gap-3">
          <Card label="Paid" value={formatINR(s.paid)} testId="summary-paid" />
          <Card label="Refund pending" value={formatINR(s.pending)} testId="summary-pending" />
          <Card label="Refund received" value={formatINR(s.received)} testId="summary-received" />
          <Card label="Open deals" value={String(s.open)} testId="summary-open" />
        </section>
      )}

      {s && s.urgent > 0 && (
        <Link to="/deals?chip=needs_action" data-testid="deadline-banner"
          className="block rounded-lg bg-danger-soft p-4 text-sm font-bold text-danger">
          {s.overdue > 0 ? `${s.overdue} overdue` : ''}{s.overdue > 0 && s.urgent - s.overdue > 0 ? ' · ' : ''}
          {s.urgent - s.overdue > 0 ? `${s.urgent - s.overdue} due within ${me.alert_days} day${me.alert_days === 1 ? '' : 's'}` : ''}
        </Link>
      )}

      <section>
        <h2 className="mb-3 text-base font-bold md:text-lg">Needs action now</h2>
        {!deals ? <Skeleton /> : urgent.length ? (
          <div className="space-y-3" data-testid="urgent-list">{urgent.map((d) => <DealCard key={d.id} deal={d} />)}</div>
        ) : <Empty title="Nothing urgent" testId="urgent-empty">No review or form deadline in the next {me.alert_days} days.</Empty>}
      </section>

      <section>
        <h2 className="mb-3 text-base font-bold md:text-lg">Recent deals</h2>
        {!deals ? <Skeleton /> : recent.length ? (
          <div className="space-y-3">{recent.map((d) => <DealCard key={d.id} deal={d} />)}</div>
        ) : (
          <Empty title="No deals yet" testId="home-empty">
            <Link to="/deals/new" className="font-bold text-primary">Add your first deal</Link> — it takes 15 seconds.
          </Empty>
        )}
      </section>
    </div>
  )
}
