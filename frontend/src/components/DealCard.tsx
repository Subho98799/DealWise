import { useRef, useState, type TouchEvent } from 'react'
import { Link } from 'react-router-dom'
import { Check, CircleAlert, CircleDollarSign, Clock3, FileText, MoreHorizontal, PenLine, Pencil, Trash2 } from 'lucide-react'
import { Avatar } from './Avatar'
import { Button, Chip, IconButton, Sheet } from './ui'
import { deleteDeal, dealAction, updateDeal } from '../data/mutations'
import { useToast } from './Toast'
import { useToday, useUser } from '../data/hooks'
import { ACTION_LABEL, evaluate, isCompleted, netPaise, nextAction, type Action } from '../lib/rules'
import { formatINR } from '../lib/money'
import { countdown } from '../lib/dates'
import type { Deal } from '../data/types'

export function DealCard({ deal }: { deal: Deal }) {
  const me = useUser()
  const today = useToday()
  const toast = useToast()
  const next = nextAction(deal)
  const net = netPaise(deal)
  const urgency = evaluate(deal, today, me.alert_days)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const touchStart = useRef<number | null>(null)
  const stripe = deal.payment_status === 'received' ? 'deal-card-success' : urgency.isOverdue ? 'deal-card-danger' : urgency.isUrgent ? 'deal-card-warning' : 'deal-card-brand'
  const progress = [
    { label: 'Review', done: deal.review_status === 'done', Icon: PenLine, status: deal.review_status },
    { label: 'Form', done: deal.form_status === 'submitted', Icon: FileText, status: deal.form_status },
    { label: 'Payment', done: deal.payment_status === 'received', Icon: CircleDollarSign, status: deal.payment_status },
  ]
  const nextLabel = next === 'review_done' ? 'Review' : next === 'form_submitted' ? 'Form' : next === 'payment_received' ? 'Payment' : null

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
      setMenuOpen(true)
    }
  }
  const remove = async () => {
    await deleteDeal(deal.id)
    setConfirmDelete(false)
    toast({ message: `Deleted ${deal.product}` })
  }

  return <article data-testid="deal-card" data-deal-id={deal.id} className={`deal-card ${stripe}`}
    onTouchStartCapture={onTouchStart} onTouchEndCapture={onTouchEnd}>
    <div className="deal-card-top">
      <div className="min-w-0 flex-1">
        <Link to={`/deals/${deal.id}`} className="deal-card-product" data-testid="deal-card-product">{deal.product}</Link>
        <div className="mt-2 flex min-w-0 items-center gap-2">
          <Avatar name={deal.mediator_name ?? deal.platform ?? 'Deal'} url={null} size={28} />
          <p className="min-w-0 truncate text-xs text-muted">{[deal.platform, deal.mediator_name].filter(Boolean).join(' · ') || 'No mediator yet'}</p>
        </div>
      </div>
      <div className="deal-card-money">
        <span className="money deal-card-refund">{formatINR(deal.refund_amount)}</span>
        <span className="money deal-card-paid">Paid {formatINR(deal.amount_paid)}</span>
      </div>
    </div>

    <div className="deal-card-meta">
      <div data-testid="deal-card-progress" role="group" aria-label="Deal progress" className="deal-progress-indicator">
        {progress.map(({ label, done, Icon, status }) => <div key={label} className={`deal-progress-step ${done ? 'is-done' : ''} ${status === 'disputed' ? 'is-disputed' : ''}`} aria-label={`${label}: ${status === 'done' || status === 'submitted' || status === 'received' ? 'complete' : status === 'disputed' ? 'disputed' : 'pending'}`}>
          <span className="deal-progress-track" aria-hidden="true"><span /></span>
          <span className="deal-progress-label"><Icon size={14} strokeWidth={2} aria-hidden="true" />{label}</span>
          {status === 'disputed' && <span className="deal-progress-disputed">Disputed</span>}
        </div>)}
      </div>
      <p data-testid="deal-card-next" className="deal-progress-next">{nextLabel ? <>Next: <strong>{nextLabel}</strong></> : <strong>All steps complete</strong>}</p>
      {(net < 0 || isCompleted(deal) || (urgency.isUrgent && urgency.due)) && <div className="deal-card-flags">
        {(net < 0 || isCompleted(deal)) && <Chip variant={net < 0 ? 'danger' : 'success'} icon={net < 0 ? CircleAlert : Check}>{net < 0 ? 'Net loss' : 'Net profit'} {formatINR(net)}</Chip>}
        {urgency.isUrgent && urgency.due && <Chip testId="deal-card-countdown" variant={urgency.isOverdue ? 'danger' : 'warning'} icon={Clock3}>
          {countdown(urgency.due, today)}
        </Chip>}
      </div>}
    </div>

    <div className="deal-card-actions">
      {next && !isCompleted(deal) && <Button data-testid="deal-card-action-button" className="deal-next-action" onClick={() => void perform(next)}>{ACTION_LABEL[next]}</Button>}
      <IconButton label={menuOpen ? 'Close deal actions' : 'More deal actions'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
        <MoreHorizontal size={20} aria-hidden="true" />
      </IconButton>
    </div>
    {menuOpen && <div className="deal-card-menu">
      <Link to={`/deals/${deal.id}/edit`} data-testid="deal-card-edit" className="deal-menu-action"><Pencil size={16} aria-hidden="true" />Edit</Link>
      <button type="button" data-testid="deal-card-delete" className="deal-menu-action deal-menu-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={16} aria-hidden="true" />Delete</button>
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
