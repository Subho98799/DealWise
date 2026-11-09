import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CircleCheck, CircleDollarSign, TrendingUp } from 'lucide-react'
import { DealCard } from '../components/DealCard'
import { Avatar } from '../components/Avatar'
import { HomeInstallBanner } from '../components/InstallPrompt'
import { Button, Card, Chip, EmptyState, Skeleton, Stat } from '../components/ui'
import { useDeals, useMediators, useSummary, useToday, useUser, mediatorStats } from '../data/hooks'
import { dealAction, updateDeal } from '../data/mutations'
import { useToast } from '../components/Toast'
import { ACTION_LABEL, evaluate, isCompleted, nextAction, sortDeals, type Action } from '../lib/rules'
import { countdown } from '../lib/dates'
import { formatINR } from '../lib/money'
import type { Deal } from '../data/types'
import { monthlyOverview } from './homeData'

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
  const pendingAnimation = useFirstCountUp(summary?.pending ?? 0, !!summary)
  const pendingForDisplay = pendingAnimation.value
  const urgent = deals ? sortDeals(deals.filter((deal) => evaluate(deal, today, me.alert_days).isUrgent), 'urgency') : []
  const recent = deals ? sortDeals(deals, 'newest').slice(0, 5) : []
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
    </header>

    {!summary ? <Skeleton rows={2} /> : <>
      <section data-testid="refund-hero" className={`refund-hero ${pendingForDisplay < 0 ? 'refund-hero-negative' : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold opacity-90">Refund pending</p>
            <p data-testid="summary-pending" data-animation-done={pendingAnimation.complete} className="hero-amount money mt-2">{formatINR(pendingForDisplay)}</p>
          </div>
          <span className="hero-mark" aria-hidden="true"><CircleDollarSign size={22} /></span>
        </div>
        <div className="mt-5">
          <div className="hero-progress-track" role="progressbar" aria-label="Refunds received" aria-valuemin={0}
            aria-valuemax={summary.received + summary.pending} aria-valuenow={summary.received}>
            <span style={{ width: `${summary.received + summary.pending ? Math.round(summary.received / (summary.received + summary.pending) * 100) : 0}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs">
            <span><span className="font-semibold">{formatINR(summary.received)}</span><span className="ml-1 opacity-80">received</span></span>
            <span className="text-right"><span className="font-semibold">{formatINR(summary.pending)}</span><span className="ml-1 opacity-80">still pending</span></span>
          </div>
        </div>
        {summary.urgent > 0 && <Link to="/deals?chip=needs_action" data-testid="deadline-banner" className="hero-deadline mt-5">
          <span>{summary.overdue > 0 ? `${summary.overdue} overdue` : `${summary.urgent} need attention`}</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>}
      </section>

      <HomeInstallBanner />

      <section aria-label="Money summary" className="grid grid-cols-3 gap-2.5">
        <Stat label="Paid" value={formatINR(summary.paid)} icon={CircleDollarSign} />
        <Stat label="Received" value={formatINR(summary.received)} icon={CircleCheck} />
        <Stat label="Gain/loss" value={formatINR(summary.gainLoss)} icon={TrendingUp} />
      </section>
    </>}

    <section aria-labelledby="needs-action-title">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><p className="section-eyebrow">Next up</p><h2 id="needs-action-title" className="section-title">Needs action</h2></div>
        {urgent.length > 0 && <Link to="/deals?chip=needs_action" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary">See all <ArrowRight size={16} aria-hidden="true" /></Link>}
      </div>
      {!deals ? <Skeleton rows={2} /> : urgent.length ? <div data-testid="urgent-list" className="urgent-carousel -mx-gutter flex snap-x gap-3 overflow-x-auto px-gutter pb-2">
        {urgent.map((deal) => <UrgentDeal key={deal.id} deal={deal} today={today} alertDays={me.alert_days} />)}
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
      {!deals ? <Skeleton rows={2} /> : recent.length ? <div className="space-y-3">{recent.map((deal) => <DealCard key={deal.id} deal={deal} />)}</div> : <EmptyState title="Start with your first deal">
        <p>Track what you paid, what’s coming back, and when to follow up.</p>
        <Link to="/deals/new" className="mt-3 inline-flex min-h-[44px] items-center font-semibold text-primary">Add a deal <ArrowRight size={16} className="ml-1" aria-hidden="true" /></Link>
      </EmptyState>}
    </section>
  </div>
}

function UrgentDeal({ deal, today, alertDays }: { deal: Deal; today: string; alertDays: number }) {
  const toast = useToast()
  const urgency = evaluate(deal, today, alertDays)
  const action = nextAction(deal)
  const accent = urgency.isOverdue ? 'urgent-card-overdue' : 'urgent-card-due'
  const perform = async (next: Action) => {
    const previous = await dealAction(deal, next, today)
    if ('vibrate' in navigator) navigator.vibrate?.(10)
    toast({ message: `${ACTION_LABEL[next]}: ${deal.product}`, action: { label: 'Undo', run: () => void updateDeal(deal.id, previous) } })
  }
  return <Card className={`urgent-card ${accent}`}>
    <div className="urgent-card-heading">
      <div className="min-w-0">
        <p className="urgent-card-title font-display text-base font-bold">{deal.product}</p>
        {urgency.due && <Chip className="urgent-card-deadline" variant={urgency.isOverdue ? 'danger' : 'warning'}>{countdown(urgency.due, today)}</Chip>}
        <p className="mt-1 truncate text-xs text-muted">{deal.mediator_name || deal.platform || 'No mediator yet'}</p>
      </div>
    </div>
    <p className="money mt-4 font-display text-xl font-bold">{formatINR(deal.refund_amount)} <span className="font-sans text-xs font-medium text-muted">net refund</span></p>
    {action && !isCompleted(deal) && <Button data-testid="deal-card-action-button" className="mt-4 w-full" onClick={() => void perform(action)}>{ACTION_LABEL[action]}</Button>}
  </Card>
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
