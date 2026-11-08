import { Link } from 'react-router-dom'
import { dealAction } from '../data/mutations'
import { updateDeal } from '../data/mutations'
import { useToast } from './Toast'
import { useToday, useUser } from '../data/hooks'
import { ACTION_LABEL, evaluate, isCompleted, netPaise, nextAction } from '../lib/rules'
import { formatINR } from '../lib/money'
import { countdown, formatShort } from '../lib/dates'
import type { Deal } from '../data/types'

function Tag({ ok, children }: { ok: boolean; children: string }) {
  return <span className={`rounded-pill px-2 py-0.5 text-[11px] font-bold ${ok ? 'bg-primary/15 text-primary' : 'bg-surface-2 text-muted'}`}>{children}</span>
}

export function DealCard({ deal }: { deal: Deal }) {
  const me = useUser()
  const today = useToday()
  const toast = useToast()
  const u = evaluate(deal, today, me.alert_days)
  const next = nextAction(deal)
  const net = netPaise(deal)

  const act = async () => {
    if (!next) return
    const previous = await dealAction(deal, next, today)
    toast({ message: `${ACTION_LABEL[next]}: ${deal.product}`, action: { label: 'Undo', run: () => void updateDeal(deal.id, previous) } })
  }

  return (
    <article data-testid="deal-card" data-deal-id={deal.id} className="rounded-lg bg-surface p-4 shadow-card">
      <Link to={`/deals/${deal.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 data-testid="deal-card-product" className="truncate font-bold">{deal.product}</h3>
            <p className="truncate text-xs text-muted">
              {[deal.platform, deal.mediator_name, formatShort(deal.date_taken)].filter(Boolean).join(' · ')}
            </p>
          </div>
          {u.due && (
            <span data-testid="deal-card-countdown" className={`shrink-0 rounded-pill px-2 py-1 text-[11px] font-bold ${u.isOverdue ? 'bg-danger-soft text-danger' : 'bg-accent/25'}`}>
              {countdown(u.due, today)}
            </span>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div><dt className="text-muted">Paid</dt><dd className="font-bold">{formatINR(deal.amount_paid)}</dd></div>
          <div><dt className="text-muted">Refund</dt><dd className="font-bold">{formatINR(deal.refund_amount)}</dd></div>
          <div><dt className="text-muted">Net</dt><dd className={`font-bold ${net < 0 ? 'text-danger' : 'text-primary'}`}>{formatINR(net)}</dd></div>
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Tag ok={deal.review_status === 'done'}>{deal.review_status === 'done' ? 'Reviewed' : 'Review pending'}</Tag>
          <Tag ok={deal.form_status === 'submitted'}>{deal.form_status === 'submitted' ? 'Form sent' : 'Form pending'}</Tag>
          <Tag ok={deal.payment_status === 'received'}>{deal.payment_status === 'received' ? 'Paid out' : deal.payment_status === 'disputed' ? 'Disputed' : 'Payment pending'}</Tag>
        </div>
      </Link>
      {next && !isCompleted(deal) && (
        <button data-testid="deal-card-action-button" onClick={act}
          className="mt-3 min-h-[44px] w-full rounded-pill bg-primary/10 text-sm font-bold text-primary transition-transform active:scale-[0.98]">
          {ACTION_LABEL[next]}
        </button>
      )}
    </article>
  )
}
