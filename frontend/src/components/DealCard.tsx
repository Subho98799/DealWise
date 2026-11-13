import { useRef, type TouchEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, CircleCheck, Clock3, FileText, IndianRupee, PenLine } from 'lucide-react'
import { IconButton } from './ui'
import { PlatformBadge } from './PlatformBadge'
import { dealAction, updateDeal } from '../data/mutations'
import { useToast } from './Toast'
import { useToday, useUser } from '../data/hooks'
import { ACTION_LABEL, evaluate, nextAction, type Action } from '../lib/rules'
import { formatINR } from '../lib/money'
import { countdown } from '../lib/dates'
import type { Deal } from '../data/types'

export function DealCard({ deal, number }: { deal: Deal; number: number }) {
  const me = useUser()
  const today = useToday()
  const toast = useToast()
  const navigate = useNavigate()
  const next = nextAction(deal)
  const urgency = evaluate(deal, today, me.alert_days)
  const touchStart = useRef<number | null>(null)
  const stripe = deal.payment_status === 'received' ? 'deal-card-success' : urgency.isOverdue ? 'deal-card-danger' : urgency.isUrgent ? 'deal-card-warning' : 'deal-card-brand'
  const progress = [
    { label: 'Review', done: deal.review_status === 'done', status: deal.review_status },
    { label: 'Form', done: deal.form_status === 'submitted', status: deal.form_status },
    { label: 'Payment', done: deal.payment_status === 'received', status: deal.payment_status },
  ]
  const nextLabel = next === 'review_done' ? 'Review' : next === 'form_submitted' ? 'Form' : 'Payment'
  const NextIcon = next === 'review_done' ? PenLine : next === 'form_submitted' ? FileText : IndianRupee
  const detailsPath = `/deals/${deal.id}`

  const perform = async (action: Action) => {
    const previous = await dealAction(deal, action, today)
    if ('vibrate' in navigator) navigator.vibrate?.(10)
    toast({ message: `${ACTION_LABEL[action]}: ${deal.product}`, action: { label: 'Undo', run: () => void updateDeal(deal.id, previous) } })
  }
  const onTouchStart = (event: TouchEvent<HTMLElement>) => { touchStart.current = event.touches[0]?.clientX ?? null }
  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    if (touchStart.current === null) return
    const distance = event.changedTouches[0]?.clientX - touchStart.current
    touchStart.current = null
    if (distance > 72 && next) {
      event.preventDefault()
      event.stopPropagation()
      void perform(next)
    } else if (distance < -72) {
      event.preventDefault()
      event.stopPropagation()
      navigate(detailsPath)
    }
  }

  return <article data-testid="deal-card" data-deal-id={deal.id} className={`deal-card ${stripe}`}
    onTouchStartCapture={onTouchStart} onTouchEndCapture={onTouchEnd}>
    <div className="deal-card-row">
      <PlatformBadge platform={deal.platform} size={30} />
      <div className="deal-card-main">
        <div className="deal-card-title">
          <span data-testid="deal-card-number" className="deal-card-number">#{number}</span>
          <Link to={detailsPath} className="deal-card-product" data-testid="deal-card-product">{deal.product}</Link>
        </div>
        <div data-testid="deal-card-progress" role="group" aria-label="Deal progress" className="deal-progress-indicator">
          {progress.map(({ label, done, status }) => <div key={label} className={`deal-progress-step ${done ? 'is-done' : ''} ${status === 'disputed' ? 'is-disputed' : ''}`}
            aria-label={`${label}: ${done ? 'complete' : status === 'disputed' ? 'disputed' : 'pending'}`}>
            <span className="deal-progress-track" aria-hidden="true"><span /></span>
          </div>)}
        </div>
        <div className="deal-card-status">
          {next ? <span className="deal-next-pill"><NextIcon size={12} aria-hidden="true" />Next: {nextLabel}</span>
            : <span className="deal-done-pill"><CircleCheck size={12} aria-hidden="true" />Complete</span>}
          {urgency.isUrgent && urgency.due && <span data-testid="deal-card-countdown"
            className={`deal-due-pill ${urgency.isOverdue ? 'is-overdue' : ''}`}>
            <Clock3 size={12} aria-hidden="true" />{countdown(urgency.due, today)}
          </span>}
        </div>
      </div>
      <div className="deal-card-side">
        <span data-testid="deal-card-net-refund" className="deal-card-refund money">{formatINR(deal.refund_amount)}</span>
        <div className="deal-card-side-actions">
          {next
            ? <IconButton label={ACTION_LABEL[next]} data-testid="deal-card-action-button" className="deal-card-quick-action" onClick={() => void perform(next)}>
              <NextIcon size={19} aria-hidden="true" />
            </IconButton>
            : <span className="deal-card-done-mark" aria-label="All steps complete"><CircleCheck size={18} aria-hidden="true" /></span>}
          <Link to={detailsPath} className="ui-icon-button deal-card-open" data-testid="deal-card-view" aria-label="View deal details" title="View deal details">
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  </article>
}
