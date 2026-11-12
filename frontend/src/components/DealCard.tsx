import { useRef, useState, type TouchEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, CircleDollarSign, Clock3, FileText, PenLine, Pencil, Trash2 } from 'lucide-react'
import { Button, Chip, IconButton, Sheet } from './ui'
import { PlatformBadge } from './PlatformBadge'
import { deleteDeal, dealAction, updateDeal } from '../data/mutations'
import { useToast } from './Toast'
import { useToday, useUser } from '../data/hooks'
import { ACTION_LABEL, evaluate, isCompleted, nextAction, type Action } from '../lib/rules'
import { formatINR } from '../lib/money'
import { countdown, formatShort } from '../lib/dates'
import type { Deal } from '../data/types'

export function DealCard({ deal, number }: { deal: Deal; number: number }) {
  const me = useUser()
  const today = useToday()
  const toast = useToast()
  const next = nextAction(deal)
  const urgency = evaluate(deal, today, me.alert_days)
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const touchStart = useRef<number | null>(null)
  const stripe = deal.payment_status === 'received' ? 'deal-card-success' : urgency.isOverdue ? 'deal-card-danger' : urgency.isUrgent ? 'deal-card-warning' : 'deal-card-brand'
  const progress = [
    { label: 'Review', done: deal.review_status === 'done', status: deal.review_status },
    { label: 'Form', done: deal.form_status === 'submitted', status: deal.form_status },
    { label: 'Payment', done: deal.payment_status === 'received', status: deal.payment_status },
  ]
  const nextLabel = next === 'review_done' ? 'Review' : next === 'form_submitted' ? 'Form' : next === 'payment_received' ? 'Payment' : null
  const NextIcon = next === 'review_done' ? PenLine : next === 'form_submitted' ? FileText : CircleDollarSign

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
      setOpen(true)
    }
  }
  const remove = async () => {
    await deleteDeal(deal.id)
    setConfirmDelete(false)
    toast({ message: `Deleted ${deal.product}` })
  }

  return <article data-testid="deal-card" data-deal-id={deal.id} className={`deal-card ${stripe}`}
    onTouchStartCapture={onTouchStart} onTouchEndCapture={onTouchEnd}>
    <div className="deal-card-row">
      <PlatformBadge platform={deal.platform} size={30} />
      <div className="deal-card-main">
        <div className="deal-card-title">
          <span data-testid="deal-card-number" className="deal-card-number">#{number}</span>
          <Link to={`/deals/${deal.id}`} className="deal-card-product" data-testid="deal-card-product">{deal.product}</Link>
        </div>
        <div data-testid="deal-card-progress" role="group" aria-label="Deal progress" className="deal-progress-indicator">
          {progress.map(({ label, done, status }) => <div key={label} className={`deal-progress-step ${done ? 'is-done' : ''} ${status === 'disputed' ? 'is-disputed' : ''}`} aria-label={`${label}: ${status === 'done' || status === 'submitted' || status === 'received' ? 'complete' : status === 'disputed' ? 'disputed' : 'pending'}`}>
            <span className="deal-progress-track" aria-hidden="true"><span /></span>
          </div>)}
        </div>
      </div>
      <div className="deal-card-side">
        <span data-testid="deal-card-net-refund" className="deal-card-refund money">{formatINR(deal.refund_amount)}</span>
        <div className="deal-card-side-actions">
          {next && !isCompleted(deal)
            ? <IconButton label={ACTION_LABEL[next]} data-testid="deal-card-action-button" className="deal-card-quick-action" onClick={() => void perform(next)}>
              <NextIcon size={19} aria-hidden="true" />
            </IconButton>
            : <span className="deal-card-done-mark" aria-label="All steps complete"><CircleDollarSign size={18} aria-hidden="true" /></span>}
          <IconButton label={open ? 'Collapse deal details' : 'Expand deal details'} aria-expanded={open} aria-controls={`deal-details-${deal.id}`} onClick={() => setOpen((value) => !value)}>
            <ChevronDown size={20} aria-hidden="true" className={open ? 'deal-chevron is-open' : 'deal-chevron'} />
          </IconButton>
        </div>
      </div>
    </div>

    {open && <div id={`deal-details-${deal.id}`} className="deal-card-details">
      <div className="deal-card-flags">
        <Chip variant="neutral">Paid {formatINR(deal.amount_paid)}</Chip>
        <Chip variant="neutral">Less {formatINR(deal.less_amount)}</Chip>
        <Chip variant="neutral">Commission +{formatINR(deal.commission)}</Chip>
        {urgency.isUrgent && urgency.due && <Chip testId="deal-card-countdown" variant={urgency.isOverdue ? 'danger' : 'warning'} icon={Clock3}>
          {countdown(urgency.due, today)}
        </Chip>}
      </div>
      <dl className="deal-card-meta">
        <div><dt>Mediator</dt><dd>{deal.mediator_name || '—'}</dd></div>
        <div><dt>Platform</dt><dd>{deal.platform || '—'}</dd></div>
        <div><dt>Taken</dt><dd>{formatShort(deal.date_taken)}</dd></div>
        <div><dt>Review due</dt><dd>{formatShort(deal.review_deadline) || '—'}</dd></div>
        <div><dt>Form due</dt><dd>{formatShort(deal.refund_form_deadline) || '—'}</dd></div>
      </dl>
      <p data-testid="deal-card-next" className="deal-progress-next">{nextLabel ? <>Next: <strong>{nextLabel}</strong></> : <strong>All steps complete</strong>}</p>
      <div className="deal-card-actions">
        {next && !isCompleted(deal) && <Button className="deal-next-action" onClick={() => void perform(next)}>{ACTION_LABEL[next]}</Button>}
        <Link to={`/deals/${deal.id}/edit`} data-testid="deal-card-edit" className="deal-menu-action" aria-label="Edit deal"><Pencil size={16} aria-hidden="true" />Edit</Link>
        <button type="button" data-testid="deal-card-delete" className="deal-menu-action deal-menu-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={16} aria-hidden="true" />Delete</button>
      </div>
    </div>}

    <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this deal?">
      <p className="mb-5 text-sm leading-relaxed text-muted">“{deal.product}” will be removed from this device and queued to sync.</p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)}>Keep deal</Button>
        <Button variant="danger" className="flex-1" onClick={() => void remove()}><Trash2 size={16} aria-hidden="true" />Delete deal</Button>
      </div>
    </Sheet>
  </article>
}
