import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CircleCheck, Layers, Wallet } from 'lucide-react'
import { DealCard } from '../components/DealCard'
import { Avatar } from '../components/Avatar'
import { HomeInstallBanner } from '../components/InstallPrompt'
import { LogoMark } from '../components/LogoMark'
import { Card, EmptyState, Skeleton, Stat } from '../components/ui'
import { useDeals, useMediators, useSummary, useToday, useUser, mediatorStats } from '../data/hooks'
import { evaluate, sortDeals } from '../lib/rules'
import { formatINR } from '../lib/money'
import type { Deal } from '../data/types'
import { monthlyOverview } from './homeData'
import { numberDeals } from '../lib/dealNumbers'

function useFirstCountUp(target: number, ready: boolean) {
  const [value, setValue] = useState(0)
  const [complete, setComplete] = useState(false)
  const frame = useRef<number | null>(null)
  useEffect(() => {
    if (!ready) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || target === 0) {
      setValue(target)
      setComplete(true)
      return
    }
    setValue(0)
    setComplete(false)
    const start = performance.now()
    const duration = 650
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      if (progress >= 1) {
        setValue(target)
        setComplete(true)
        frame.current = null
        return
      }
      const eased = 1 - (1 - progress) ** 3
      setValue(Math.round(target * eased))
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [ready, target])
  return { value, complete }
}

export default function HomePage() {
  const me = useUser()
  const today = useToday()
  const deals = useDeals()
  const mediators = useMediators()
  const summary = useSummary(deals)
  const numbering = useMemo(() => deals ? numberDeals(deals) : undefined, [deals])
  const pendingAnimation = useFirstCountUp(summary?.pending ?? 0, !!summary)
  const pendingForDisplay = pendingAnimation.value
  const urgent = deals ? sortDeals(deals.filter((deal) => evaluate(deal, today, me.alert_days).isUrgent), 'needs_action') : []
  const recent = deals ? sortDeals(deals, 'newest').slice(0, 5) : []
  const refundTotal = (summary?.received ?? 0) + (summary?.pending ?? 0)
  const receivedShare = refundTotal > 0 ? (summary?.received ?? 0) / refundTotal : 0
  const ringCircumference = 2 * Math.PI * 52
  const ringStyle = {
    '--ring-circumference': `${ringCircumference}`,
    '--ring-offset': `${ringCircumference * (1 - receivedShare)}`,
  } as CSSProperties
  const topMediators = useMemo(() => {
    if (!mediators || !deals) return undefined
    const stats = mediatorStats(deals)
    return mediators.map((mediator) => ({ mediator, stats: stats.get(mediator.id) ?? { pendingPaise: 0, openCount: 0 } }))
      .filter(({ stats: value }) => value.pendingPaise > 0)
      .sort((a, b) => b.stats.pendingPaise - a.stats.pendingPaise)
      .slice(0, 5)
  }, [mediators, deals])

  return <div data-testid="home-page" className="home-page space-y-7">
    <header className="home-greeting">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Your deals, at a glance</p>
      <h1 data-testid="home-user-name" className="mt-1 truncate font-display text-2xl font-bold tracking-tight">Welcome back, {me.name?.split(' ')[0] ?? 'there'}</h1>
      {deals && <p data-testid="home-deal-count" className="mt-1 text-sm text-muted">Total deals {deals.length} · Open deals {summary?.open ?? 0}</p>}
    </header>

    {!summary ? <Skeleton rows={2} /> : <>
      <section data-testid="refund-hero" className={`refund-hero ${pendingForDisplay < 0 ? 'refund-hero-negative' : ''}`}>
        <div className="refund-ring-row">
          <div className="refund-ring" role="img" aria-label={`${Math.round(receivedShare * 100)}% of refunds received`}>
            <svg className="refund-ring-svg" viewBox="0 0 120 120" aria-hidden="true">
              <circle className="refund-ring-track" cx="60" cy="60" r="52" />
              <circle className="refund-ring-value" cx="60" cy="60" r="52" style={ringStyle} />
            </svg>
            <span className="refund-ring-logo" aria-hidden="true"><LogoMark size={44} /></span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold opacity-90">Refund pending</p>
            <p data-testid="summary-pending" data-animation-done={pendingAnimation.complete} className="hero-amount money mt-2">{formatINR(pendingForDisplay)}</p>
          </div>
        </div>
        <div className="refund-legend">
          <span className="refund-legend-item"><i className="refund-legend-dot" aria-hidden="true" />Received<b>{formatINR(summary.received)}</b></span>
          <span className="refund-legend-item"><i className="refund-legend-dot is-pending" aria-hidden="true" />Still pending<b>{formatINR(summary.pending)}</b></span>
        </div>
        {summary.urgent > 0 && <Link to="/deals?chip=needs_action" data-testid="deadline-banner" className="hero-deadline mt-5">
          <span>{summary.overdue > 0 ? `${summary.overdue} overdue` : `${summary.urgent} need attention`}</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>}
      </section>

      <HomeInstallBanner />

      <section aria-label="Money summary" className="grid grid-cols-3 gap-2.5">
        <Stat label="Paid" value={formatINR(summary.paid)} icon={Wallet} tone="paid" />
        <Stat label="Received" value={formatINR(summary.received)} icon={CircleCheck} tone="received" />
        <Stat label="Deals taken till date" value={deals?.length ?? 0} icon={Layers} tone="taken" />
      </section>
    </>}

    <section aria-labelledby="needs-action-title">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><p className="section-eyebrow">Next up</p><h2 id="needs-action-title" className="section-title">Needs action</h2></div>
        {urgent.length > 0 && <Link to="/deals?chip=needs_action" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary">See all <ArrowRight size={16} aria-hidden="true" /></Link>}
      </div>
      {!deals ? <Skeleton rows={2} /> : urgent.length ? <div data-testid="urgent-list" className="space-y-3">
        {urgent.slice(0, 5).map((deal) => <DealCard key={deal.id} deal={deal} number={numbering!.byId.get(deal.id)!} />)}
      </div> : <EmptyState title="Nothing urgent today" testId="urgent-empty">You’re all caught up. We’ll flag a deal when a deadline needs your attention.</EmptyState>}
    </section>

    <section aria-labelledby="mediator-summary-title">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><p className="section-eyebrow">People</p><h2 id="mediator-summary-title" className="section-title">Top mediators</h2></div>
        <Link to="/mediators" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary">All mediators <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
      {!topMediators ? <Skeleton rows={2} /> : topMediators.length ? <Card className="top-mediators-card">
        {topMediators.map(({ mediator, stats: value }, index) => {
          const max = topMediators[0]?.stats.pendingPaise ?? 1
          return <Link key={mediator.id} to={`/mediators/${mediator.id}`} className="mediator-summary-row">
            <Avatar name={mediator.name} url={null} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{mediator.name}</span>
              <span className="mediator-bar" aria-hidden="true"><span style={{ width: `${Math.round(value.pendingPaise / max * 100)}%` }} /></span>
            </span>
            <span className="text-right"><span className="money block text-sm font-bold">{formatINR(value.pendingPaise)}</span><span className="text-xs text-muted">pending</span></span>
            <span className="sr-only">Rank {index + 1}, {value.openCount} open deals</span>
          </Link>
        })}
      </Card> : <EmptyState title="Your mediator list starts here">Add a mediator to see how much refund is pending with each person.</EmptyState>}
    </section>

    <MonthlyOverview deals={deals} today={today} />

    <section aria-labelledby="recent-deals-title">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><p className="section-eyebrow">Latest activity</p><h2 id="recent-deals-title" className="section-title">Recent deals</h2></div>
        {!!deals?.length && <Link to="/deals" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary">See all <ArrowRight size={16} aria-hidden="true" /></Link>}
      </div>
      {!deals ? <Skeleton rows={2} /> : recent.length ? <div className="space-y-3">{recent.map((deal) => <DealCard key={deal.id} deal={deal} number={numbering!.byId.get(deal.id)!} />)}</div> : <EmptyState title="Start with your first deal">
        <p>Track what you paid, what’s coming back, and when to follow up.</p>
        <Link to="/deals/new" className="mt-3 inline-flex min-h-[44px] items-center font-semibold text-primary">Add a deal <ArrowRight size={16} className="ml-1" aria-hidden="true" /></Link>
      </EmptyState>}
    </section>
  </div>
}

function MonthlyOverview({ deals, today }: { deals: Deal[] | undefined; today: string }) {
  const months = useMemo(() => deals ? monthlyOverview(deals, today) : [], [deals, today])
  const populated = months.filter((month) => month.hasData).length
  const maxValue = Math.max(1, ...months.flatMap((month) => [month.paid, month.refunded]))
  const points = months.map((month) => `${month.label}: paid ${formatINR(month.paid)}, net refund ${formatINR(month.refunded)}, gain/loss ${formatINR(month.gainLoss)}`).join('. ')
  return <section aria-labelledby="monthly-title">
    <div className="mb-3"><p className="section-eyebrow">Six month view</p><h2 id="monthly-title" className="section-title">Monthly overview</h2></div>
    {!deals ? <Skeleton rows={2} /> : populated < 2 ? <EmptyState title="Your monthly story is just getting started">Add deals across a couple of months to see paid and refunded totals here.</EmptyState> : <Card className="monthly-card">
      <div className="mb-3 flex flex-wrap gap-4 text-xs font-semibold text-muted">
        <span className="inline-flex items-center gap-2"><i className="chart-legend chart-paid" /> Paid</span>
        <span className="inline-flex items-center gap-2"><i className="chart-legend chart-refunded" /> Refunded</span>
      </div>
      <p className="sr-only">Monthly deal totals for the last six months. {points}</p>
      <svg data-testid="monthly-overview-chart" className="monthly-chart" viewBox="0 0 360 190" role="img" aria-label={`Monthly paid and refunded totals. ${points}`}>
        <line x1="12" x2="348" y1="126" y2="126" stroke="var(--color-border)" />
        {months.map((month, index) => {
          const x = 22 + index * 55
          const paidHeight = month.paid ? Math.max(3, month.paid / maxValue * 86) : 0
          const refundedHeight = month.refunded ? Math.max(3, month.refunded / maxValue * 86) : 0
          return <g key={month.key}>
            <rect x={x} y={126 - paidHeight} width="17" height={paidHeight} rx="5" fill="var(--color-brand)"><title>{month.label} paid {formatINR(month.paid)}</title></rect>
            <rect x={x + 20} y={126 - refundedHeight} width="17" height={refundedHeight} rx="5" fill="var(--color-success)"><title>{month.label} refunded {formatINR(month.refunded)}</title></rect>
            <text x={x + 18} y="146" textAnchor="middle" className="chart-label">{month.label}</text>
            <text x={x + 18} y="165" textAnchor="middle" className="chart-net">{compactINR(month.gainLoss)}</text>
          </g>
        })}
      </svg>
      <p className="mt-1 text-center text-xs text-muted">Gain/loss by month</p>
    </Card>}
  </section>
}

function compactINR(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(paise / 100)
}
