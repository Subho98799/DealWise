import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDeal, useToday, useUser } from '../data/hooks'
import { dealAction, deleteDeal, updateDeal } from '../data/mutations'
import { useToast } from '../components/Toast'
import { btn, Empty, PageTitle, Skeleton } from '../components/ui'
import { ACTION_LABEL, applyAction, evaluate, netPaise, type Action } from '../lib/rules'
import { formatINR } from '../lib/money'
import { countdown, formatShort } from '../lib/dates'

const ACTIONS: Action[] = ['review_done', 'form_submitted', 'payment_received', 'reopen_payment', 'reopen_form', 'reopen_review']

export default function DealDetailPage() {
  const { id } = useParams()
  const deal = useDeal(id)
  const me = useUser()
  const today = useToday()
  const toast = useToast()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  if (deal === undefined && id) return <Skeleton rows={3} />
  if (!deal) return <Empty title="Deal not found" testId="deal-not-found">It may have been deleted. <Link to="/deals" className="font-bold text-primary">Back to deals</Link></Empty>
  const u = evaluate(deal, today, me.alert_days)
  const allowed = ACTIONS.filter((a) => { try { applyAction(deal, a, today); return true } catch { return false } })
  const rows: [string, string][] = [
    ['Platform', deal.platform ?? '—'], ['Mediator', deal.mediator_name ?? '—'], ['Date taken', formatShort(deal.date_taken)],
    ['Paid', formatINR(deal.amount_paid)], ['Refund', formatINR(deal.refund_amount)], ['Commission', formatINR(deal.commission)],
    ['Net', formatINR(netPaise(deal))], ['Review deadline', formatShort(deal.review_deadline) || '—'],
    ['Form deadline', formatShort(deal.refund_form_deadline) || '—'], ['Payment', deal.payment_status + (deal.payment_received_on ? ` on ${formatShort(deal.payment_received_on)}` : '')],
  ]
  return (
    <div data-testid="deal-detail" className="space-y-5">
      <PageTitle right={<Link to={`/deals/${deal.id}/edit`} data-testid="deal-edit-link" className={`${btn.ghost} flex items-center`}>Edit</Link>}>
        <span data-testid="deal-detail-product">{deal.product}</span>
      </PageTitle>
      {u.due && <p className={`rounded-md px-4 py-3 text-sm font-bold ${u.isOverdue ? 'bg-danger-soft text-danger' : 'bg-accent/25'}`}>{u.reason?.startsWith('review') ? 'Review' : 'Refund form'}: {countdown(u.due, today)}</p>}
      <dl className="divide-y divide-line rounded-lg bg-surface px-4 shadow-card">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-3 text-sm"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>)}
      </dl>
      {deal.notes && <p className="whitespace-pre-wrap rounded-lg bg-surface p-4 text-sm shadow-card">{deal.notes}</p>}
      <div className="grid grid-cols-2 gap-2">
        {allowed.map((a) => (
          <button key={a} data-testid={`deal-action-${a}`} className={a.startsWith('reopen') ? btn.ghost : btn.primary}
            onClick={async () => {
              const prev = await dealAction(deal, a, today)
              toast({ message: ACTION_LABEL[a], action: { label: 'Undo', run: () => void updateDeal(deal.id, prev) } })
            }}>{ACTION_LABEL[a]}</button>
        ))}
      </div>
      {!confirm ? (
        <button data-testid="deal-delete-button" className={`${btn.danger} w-full`} onClick={() => setConfirm(true)}>Delete deal</button>
      ) : (
        <div className="flex gap-2">
          <button className={`${btn.ghost} flex-1`} onClick={() => setConfirm(false)}>Cancel</button>
          <button data-testid="deal-delete-confirm-button" className={`${btn.danger} flex-1`}
            onClick={async () => { await deleteDeal(deal.id); toast({ message: 'Deal deleted' }); navigate('/deals', { replace: true }) }}>Yes, delete</button>
        </div>
      )}
    </div>
  )
}
