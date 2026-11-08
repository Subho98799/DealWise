import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDeal, useMediators, useToday } from '../data/hooks'
import { createDeal, updateDeal } from '../data/mutations'
import { local } from '../data/db'
import { btn, input, PageTitle, Skeleton } from '../components/ui'
import { isValidMoney } from '../lib/money'
import type { Deal } from '../data/types'

type Form = Record<'product' | 'mediator_name' | 'amount_paid' | 'refund_amount' | 'platform' | 'deal_type' | 'commission' | 'date_taken' |
  'review_deadline' | 'refund_form_deadline' | 'payment_status' | 'notes', string>

const fromDeal = (d: Deal): Form => ({
  product: d.product, mediator_name: d.mediator_name ?? '', amount_paid: d.amount_paid, refund_amount: d.refund_amount,
  platform: d.platform ?? '', deal_type: d.deal_type, commission: d.commission, date_taken: d.date_taken,
  review_deadline: d.review_deadline ?? '', refund_form_deadline: d.refund_form_deadline ?? '', payment_status: d.payment_status, notes: d.notes ?? '',
})

function validate(f: Form): string | null {
  if (!f.product.trim()) return 'Product is required.'
  if (f.product.length > 200) return 'Product is too long (max 200 characters).'
  for (const k of ['amount_paid', 'refund_amount', 'commission'] as const)
    if (f[k] && !isValidMoney(f[k])) return 'Amounts must be 0 to 1,00,00,000 with up to 2 decimals.'
  if (f.review_deadline && f.review_deadline < f.date_taken) return 'Review deadline cannot be before the date taken.'
  if (f.refund_form_deadline && f.refund_form_deadline < f.date_taken) return 'Form deadline cannot be before the date taken.'
  if (f.notes.length > 2000) return 'Notes are too long (max 2000 characters).'
  return null
}

function toDeal(f: Form): Partial<Deal> & { product: string; date_taken: string } {
  const money = (s: string) => (s ? (s.includes('.') ? s : `${s}.00`) : '0.00')
  return {
    product: f.product.trim(), mediator_name: f.mediator_name.trim() || null, amount_paid: money(f.amount_paid),
    refund_amount: money(f.refund_amount), commission: money(f.commission), platform: f.platform.trim() || null,
    deal_type: f.deal_type as Deal['deal_type'], date_taken: f.date_taken, review_deadline: f.review_deadline || null,
    refund_form_deadline: f.refund_form_deadline || null, payment_status: f.payment_status as Deal['payment_status'],
    payment_received_on: null, notes: f.notes.trim() || null,
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-bold text-muted">{label}</span>{children}</label>
}

export default function DealFormPage() {
  const { id } = useParams()
  const existing = useDeal(id)
  if (id && existing === undefined) return <Skeleton rows={4} />
  return <DealForm key={id ?? 'new'} deal={existing ?? null} />
}

function DealForm({ deal }: { deal: Deal | null }) {
  const today = useToday()
  const navigate = useNavigate()
  const mediators = useMediators() ?? []
  const blank: Form = {
    product: '', mediator_name: local.get('last_mediator') ?? '', amount_paid: '', refund_amount: '', platform: local.get('last_platform') ?? '',
    deal_type: 'review', commission: '', date_taken: today, review_deadline: '', refund_form_deadline: '', payment_status: 'pending', notes: '',
  }
  const [f, setF] = useState<Form>(deal ? fromDeal(deal) : blank)
  const [more, setMore] = useState(!!deal)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const on = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const err = validate(f)
    setError(err)
    if (err) return
    const data = toDeal(f)
    if (deal) {
      const payment = data.payment_status === 'received' ? deal.payment_received_on ?? today : null
      await updateDeal(deal.id, { ...data, payment_received_on: payment })
      navigate(`/deals/${deal.id}`, { replace: true })
    } else {
      if (data.payment_status === 'received') data.payment_received_on = today
      const d = await createDeal(data)
      setSaved(d.product)
      setF({ ...blank, platform: f.platform, mediator_name: f.mediator_name })
    }
  }

  if (saved) {
    return (
      <div data-testid="deal-saved" className="rise space-y-4 pt-10 text-center">
        <p className="text-xl font-extrabold">Saved “{saved}”</p>
        <p className="text-sm text-muted">It will sync automatically.</p>
        <div className="flex gap-3">
          <button data-testid="add-another-button" className={`${btn.primary} flex-1`} onClick={() => setSaved(null)}>Add another</button>
          <button data-testid="saved-done-button" className={`${btn.ghost} flex-1`} onClick={() => navigate('/deals')}>Done</button>
        </div>
      </div>
    )
  }

  return (
    <form data-testid="deal-form" onSubmit={submit} className="space-y-4" noValidate>
      <PageTitle>{deal ? 'Edit deal' : 'Add deal'}</PageTitle>
      <Field label="Product *"><input data-testid="deal-product-input" autoFocus={!deal} value={f.product} onChange={on('product')} className={input} maxLength={200} /></Field>
      <Field label="Mediator">
        <input data-testid="deal-mediator-input" list="mediator-names" value={f.mediator_name} onChange={on('mediator_name')} className={input} placeholder="Type to search or add new" />
        <datalist id="mediator-names">{mediators.map((m) => <option key={m.id} value={m.name} />)}</datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Paid ₹"><input data-testid="deal-amount-paid-input" inputMode="decimal" value={f.amount_paid} onChange={on('amount_paid')} className={input} placeholder="0" /></Field>
        <Field label="Refund ₹"><input data-testid="deal-refund-input" inputMode="decimal" value={f.refund_amount} onChange={on('refund_amount')} className={input} placeholder="0" /></Field>
      </div>

      <button type="button" data-testid="deal-more-toggle" onClick={() => setMore(!more)} className="min-h-[44px] text-sm font-bold text-primary">
        {more ? 'Hide details' : 'More details'}
      </button>
      {more && (
        <div className="space-y-4" data-testid="deal-more-section">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Platform"><input data-testid="deal-platform-input" value={f.platform} onChange={on('platform')} className={input} placeholder="Amazon" /></Field>
            <Field label="Date taken"><input data-testid="deal-date-input" type="date" value={f.date_taken} onChange={on('date_taken')} className={input} /></Field>
            <Field label="Deal type">
              <select data-testid="deal-type-select" value={f.deal_type} onChange={on('deal_type')} className={input}>
                <option value="review">Review</option><option value="rating_only">Rating only</option><option value="review_photo">Review + photo</option>
                <option value="review_video">Review + video</option><option value="other">Other</option>
              </select>
            </Field>
            <Field label="Commission ₹"><input data-testid="deal-commission-input" inputMode="decimal" value={f.commission} onChange={on('commission')} className={input} placeholder="0" /></Field>
            <Field label="Review deadline"><input data-testid="deal-review-deadline-input" type="date" value={f.review_deadline} onChange={on('review_deadline')} className={input} /></Field>
            <Field label="Form deadline"><input data-testid="deal-form-deadline-input" type="date" value={f.refund_form_deadline} onChange={on('refund_form_deadline')} className={input} /></Field>
          </div>
          <Field label="Payment status">
            <select data-testid="deal-payment-status-select" value={f.payment_status} onChange={on('payment_status')} className={input}>
              <option value="pending">Pending</option><option value="received">Received</option><option value="disputed">Disputed</option>
            </select>
          </Field>
          <Field label="Notes"><textarea data-testid="deal-notes-input" value={f.notes} onChange={on('notes')} rows={3} maxLength={2000} className={`${input} py-3`} /></Field>
        </div>
      )}
      {error && <p data-testid="deal-form-error" role="alert" className="rounded-sm bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
      <button data-testid="deal-save-button" type="submit" className={`${btn.primary} w-full`}>Save deal</button>
    </form>
  )
}
