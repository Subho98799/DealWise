import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, ChevronDown, Circle, CircleCheck, Clock3, LockKeyhole, PencilLine, Trash2 } from 'lucide-react'
import { useDeal, useDeals, useToday, useUser } from '../data/hooks'
import { dealAction, deleteDeal, updateDeal } from '../data/mutations'
import { useToast } from '../components/Toast'
import { btn, Empty, PageTitle, Skeleton } from '../components/ui'
import { ACTION_LABEL, evaluate, nextAction, type Action } from '../lib/rules'
import { formatINR, refundBreakdown } from '../lib/money'
import { countdown, formatShort } from '../lib/dates'
import { numberDeals } from '../lib/dealNumbers'

export default function DealDetailPage() {
  const { id } = useParams()
  const deal = useDeal(id)
  const deals = useDeals()
  const numbering = useMemo(() => deals ? numberDeals(deals) : undefined, [deals])
  const me = useUser()
  const today = useToday()
  const toast = useToast()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  if (deal === undefined && id) return <Skeleton rows={3} />
  if (!deal) return <Empty title="Deal not found" testId="deal-not-found">It may have been deleted. <Link to="/deals" className="font-bold text-primary">Back to deals</Link></Empty>
  const u = evaluate(deal, today, me.alert_days)
  const next = nextAction(deal)
  const reviewDone = deal.review_status === 'done'
  const formDone = deal.form_status === 'submitted'
  const paymentDone = deal.payment_status === 'received'
  const milestones = [
    { key: 'taken', title: 'Deal taken', done: true, date: formatShort(deal.date_taken), action: null as Action | null, hint: 'Purchase recorded' },
    { key: 'review', title: 'Review completed', done: reviewDone, date: reviewDone ? null : deal.review_deadline ? `Due ${formatShort(deal.review_deadline)}` : null, action: 'review_done' as const },
    { key: 'form', title: 'Refund form submitted', done: formDone, date: formDone ? null : deal.refund_form_deadline ? `Due ${formatShort(deal.refund_form_deadline)}` : null, action: 'form_submitted' as const },
    { key: 'payment', title: 'Payment received', done: paymentDone, date: deal.payment_received_on ? formatShort(deal.payment_received_on) : null, action: 'payment_received' as const },
  ]
  const rows: [string, string][] = [
    ['Platform', deal.platform ?? '—'], ['Mediator', deal.mediator_name ?? '—'], ['Date taken', formatShort(deal.date_taken)],
    ['Amount paid', formatINR(deal.amount_paid)], ['Less', formatINR(deal.less_amount)],
    ['Commission', formatINR(deal.commission)],
    ['Review deadline', formatShort(deal.review_deadline) || '—'],
    ['Form deadline', formatShort(deal.refund_form_deadline) || '—'], ['Payment status', deal.payment_status + (deal.payment_received_on ? ` · ${formatShort(deal.payment_received_on)}` : '')],
  ]
  return (
    <div data-testid="deal-detail" className="deal-detail-page">
      <PageTitle right={<Link to={`/deals/${deal.id}/edit`} data-testid="deal-edit-link" className={`${btn.ghost} flex items-center gap-2`}><PencilLine size={16} aria-hidden="true" />Edit</Link>}>
        <span data-testid="deal-detail-product">{deal.product}</span>
      </PageTitle>
      {numbering && <p data-testid="deal-detail-number" className="mb-3 text-sm font-semibold text-muted">Deal #{numbering.byId.get(deal.id)} of {numbering.total}</p>}
      <section className="deal-detail-hero" aria-label="Deal net refund summary">
        <span className="section-eyebrow">Net refund</span>
        <strong className="deal-detail-net money">{formatINR(deal.refund_amount)}</strong>
        <div className="deal-detail-amounts">
          <span>Paid <b className="money">{formatINR(deal.amount_paid)}</b></span>
          <span>Less <b className="money">{formatINR(deal.less_amount)}</b></span>
          <span>Commission <b className="money">{formatINR(deal.commission)}</b></span>
        </div>
        <p data-testid="deal-refund-breakdown" className="mt-3 text-sm font-semibold">{refundBreakdown(deal.amount_paid, deal.less_amount, deal.commission)}</p>
      </section>
      {u.due && <p className={`deal-detail-deadline ${u.isOverdue ? 'is-overdue' : ''}`}><Clock3 size={17} aria-hidden="true" />{u.reason?.startsWith('review') ? 'Review' : 'Refund form'}: {countdown(u.due, today)}</p>}
      <section className="deal-detail-section" aria-labelledby="deal-progress-heading">
        <div className="deal-detail-section-heading"><div><span className="section-eyebrow">Progress</span><h2 id="deal-progress-heading" className="section-title">Deal timeline</h2></div><span className="deal-progress-count">{Number(reviewDone) + Number(formDone) + Number(paymentDone)}/3 steps</span></div>
        <ol className="deal-timeline">
          {milestones.map((step, index) => {
            const isNext = step.action !== null && next === step.action
            const lockReason = step.key === 'payment'
              ? deal.review_status === 'pending' ? 'Complete the review first' : 'Submit the refund form first'
              : 'Complete the review first'
            const Icon = step.done ? CircleCheck : Circle
            const actionLabel = step.key === 'review' ? 'Mark review done' : step.key === 'form' ? 'Mark form submitted' : 'Mark payment received'
            return <li key={step.key} className={`deal-timeline-step ${step.done ? 'is-done' : ''} ${index === milestones.length - 1 ? 'is-last' : ''}`}>
              <span className="deal-timeline-marker"><Icon size={19} aria-hidden="true" /></span>
              <div className="deal-timeline-content">
                <div className="deal-timeline-heading"><strong>{step.title}</strong>{step.date && <span>{step.date}</span>}</div>
                {step.done ? <p>Marked complete</p> : isNext ? <p>Next valid step</p> : <p className="deal-timeline-lock"><LockKeyhole size={14} aria-hidden="true" />{lockReason}</p>}
                {isNext && <button type="button" data-testid={`deal-action-${step.action}`}
                  className="deal-timeline-action"
                  onClick={async () => {
                    const prev = await dealAction(deal, step.action!, today)
                    if ('vibrate' in navigator) navigator.vibrate?.(10)
                    toast({ message: ACTION_LABEL[step.action!], action: { label: 'Undo', run: () => void updateDeal(deal.id, prev) } })
                  }}>{actionLabel}<Check size={15} aria-hidden="true" /></button>}
              </div>
            </li>
          })}
        </ol>
      </section>
      <section className="deal-detail-section" aria-labelledby="deal-info-heading">
        <details className="deal-detail-fold" data-testid="deal-detail-more">
          <summary>
            <span><span className="section-eyebrow">Deal information</span><span id="deal-info-heading" className="section-title">Details, deadlines and notes</span></span>
            <ChevronDown size={20} aria-hidden="true" className="deal-fold-chevron" />
          </summary>
          <dl className="deal-detail-list">
            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          {deal.notes && <><span className="section-eyebrow deal-fold-notes-label">Notes</span><p className="deal-detail-notes">{deal.notes}</p></>}
        </details>
      </section>
      <section className="deal-danger-zone" aria-labelledby="deal-delete-heading">
        <div><h2 id="deal-delete-heading">Delete deal</h2><p>This removes the deal from your list and syncs the change.</p></div>
        {!confirm ? (
          <button data-testid="deal-delete-button" className={`${btn.danger} flex items-center gap-2`} onClick={() => setConfirm(true)}><Trash2 size={16} aria-hidden="true" />Delete</button>
        ) : (
          <div className="flex w-full gap-2">
            <button className={`${btn.ghost} flex-1`} onClick={() => setConfirm(false)}>Cancel</button>
            <button data-testid="deal-delete-confirm-button" className={`${btn.danger} flex-1`}
              onClick={async () => { await deleteDeal(deal.id); toast({ message: 'Deal deleted' }); navigate('/deals', { replace: true }) }}>Yes, delete</button>
          </div>
        )}
      </section>
    </div>
  )
}
