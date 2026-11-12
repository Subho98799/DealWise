import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDeal, useMediators, useToday } from '../data/hooks'
import { createDeal, deleteDeal, updateDeal } from '../data/mutations'
import { local } from '../data/db'
import { btn, input, PageTitle, Sheet, Skeleton } from '../components/ui'
import { PlatformCombobox } from '../components/PlatformCombobox'
import { useToast } from '../components/Toast'
import { fromPaise, isValidMoney, refundBreakdown, toPaise } from '../lib/money'
import type { Deal } from '../data/types'

type Form = Record<'product' | 'mediator_name' | 'amount_paid' | 'less_amount' | 'platform' | 'deal_type' | 'commission' | 'date_taken' |
  'review_deadline' | 'refund_form_deadline' | 'payment_status' | 'notes', string>

const fromDeal = (d: Deal): Form => ({
  product: d.product, mediator_name: d.mediator_name ?? '', amount_paid: d.amount_paid, less_amount: d.less_amount,
  platform: d.platform ?? '', deal_type: d.deal_type, commission: d.commission, date_taken: d.date_taken,
  review_deadline: d.review_deadline ?? '', refund_form_deadline: d.refund_form_deadline ?? '', payment_status: d.payment_status, notes: d.notes ?? '',
})

function validate(f: Form): string | null {
  if (!f.product.trim()) return 'Product is required.'
  if (f.product.length > 200) return 'Product is too long (max 200 characters).'
  for (const key of ['amount_paid', 'less_amount', 'commission'] as const)
    if (f[key] && !isValidMoney(f[key])) return 'Amounts must be 0 to 1,00,00,000 with up to 2 decimals.'
  if (toPaise(f.less_amount) > toPaise(f.amount_paid)) return 'Less cannot be more than the amount paid.'
  if (f.review_deadline && f.review_deadline < f.date_taken) return 'Review deadline cannot be before the date taken.'
  if (f.refund_form_deadline && f.refund_form_deadline < f.date_taken) return 'Form deadline cannot be before the date taken.'
  if (f.notes.length > 2000) return 'Notes are too long (max 2000 characters).'
  return null
}

function toDeal(f: Form): Partial<Deal> & { product: string; date_taken: string } {
  const money = (value: string) => (value ? (value.includes('.') ? value : `${value}.00`) : '0.00')
  const amountPaid = money(f.amount_paid)
  const lessAmount = money(f.less_amount)
  const commission = money(f.commission)
  return {
    product: f.product.trim(), mediator_name: f.mediator_name.trim() || null, amount_paid: amountPaid,
    less_amount: lessAmount, refund_amount: fromPaise(toPaise(amountPaid) - toPaise(lessAmount) + toPaise(commission)),
    commission, platform: f.platform.trim() || null,
    deal_type: f.deal_type as Deal['deal_type'], date_taken: f.date_taken, review_deadline: f.review_deadline || null,
    refund_form_deadline: f.refund_form_deadline || null, payment_status: f.payment_status as Deal['payment_status'],
    payment_received_on: null, notes: f.notes.trim() || null,
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="form-field"><span className="form-field-label">{label}</span>{children}</label>
}

export default function DealFormPage({ modal = false, onClose }: { modal?: boolean; onClose?: () => void }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const existing = useDeal(id)
  const close = onClose ?? (() => navigate(-1))
  if (id && existing === undefined) return <Skeleton rows={4} />
  if (modal) return <Sheet open title="Quick add deal" onClose={close}>
    <DealForm key={id ?? 'quick-add'} deal={existing ?? null} modal onClose={close} />
  </Sheet>
  return <DealForm key={id ?? 'new'} deal={existing ?? null} />
}

function DealForm({ deal, modal = false, onClose }: { deal: Deal | null; modal?: boolean; onClose?: () => void }) {
  const today = useToday()
  const navigate = useNavigate()
  const toast = useToast()
  const mediators = useMediators() ?? []
  const lastMediator = local.get('last_mediator') ?? ''
  const suggestions = useMemo(() => [...mediators].sort((a, b) => {
    if (a.name === lastMediator) return -1
    if (b.name === lastMediator) return 1
    return a.name.localeCompare(b.name)
  }), [mediators, lastMediator])
  const blank: Form = {
    product: '', mediator_name: lastMediator, amount_paid: '', less_amount: '0.00', platform: local.get('last_platform') ?? '',
    deal_type: 'review', commission: '0.00', date_taken: today, review_deadline: '', refund_form_deadline: '', payment_status: 'pending', notes: '',
  }
  const [form, setForm] = useState<Form>(deal ? fromDeal(deal) : blank)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ id: string; product: string } | null>(null)
  const on = (key: keyof Form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const breakdown = refundBreakdown(form.amount_paid, form.less_amount, form.commission)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const validation = validate(form)
    setError(validation)
    if (validation) return
    const data = toDeal(form)
    if (deal) {
      const payment = data.payment_status === 'received' ? deal.payment_received_on ?? today : null
      await updateDeal(deal.id, { ...data, payment_received_on: payment })
      navigate(`/deals/${deal.id}`, { replace: true })
    } else {
      if (data.payment_status === 'received') data.payment_received_on = today
      const created = await createDeal(data)
      setSaved({ id: created.id, product: created.product })
      setForm({ ...blank, platform: form.platform, mediator_name: form.mediator_name })
      toast({
        message: `Saved ${created.product}`,
        action: { label: 'Undo', run: () => { void deleteDeal(created.id); setSaved(null) } },
        secondaryAction: { label: 'Add another', run: () => setSaved(null) },
      })
    }
  }

  const done = () => { if (modal) onClose?.(); else navigate('/deals') }
  if (saved) return <div data-testid="deal-saved" className="deal-saved-state">
    <span className="saved-mark" aria-hidden="true">✓</span>
    <p className="font-display text-xl font-bold">Saved “{saved.product}”</p>
    <p className="text-sm text-muted">It’s on your list and will sync automatically.</p>
    <div className="mt-4 flex gap-2">
      <button data-testid="add-another-button" className={`${btn.primary} flex-1`} onClick={() => setSaved(null)}>Add another</button>
      <button data-testid="saved-done-button" className={`${btn.ghost} flex-1`} onClick={done}>{modal ? 'Done' : 'See deals'}</button>
    </div>
  </div>

  return <form data-testid="deal-form" onSubmit={submit} className={`deal-form ${modal ? 'deal-form-quick' : ''}`} noValidate>
    {!modal && <PageTitle>{deal ? 'Edit deal' : 'Add deal'}</PageTitle>}
    {modal && <p className="mb-4 text-sm text-muted">Capture the essentials now. You can add deadlines and notes later.</p>}
    <Field label="Product *"><input data-testid="deal-product-input" autoFocus={!deal} value={form.product} onChange={on('product')} className={`${input} form-product-input`} maxLength={200} placeholder="What did you buy?" /></Field>
    <Field label="Mediator">
      <input data-testid="deal-mediator-input" list="mediator-names" value={form.mediator_name} onChange={on('mediator_name')} className={input} placeholder="Search or add a name" />
      <datalist id="mediator-names">{suggestions.map((mediator) => <option key={mediator.id} value={mediator.name} />)}</datalist>
    </Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Amount paid"><input data-testid="deal-amount-paid-input" inputMode="decimal" value={form.amount_paid} onChange={on('amount_paid')} className={`${input} money-field-input`} placeholder="₹ 0" /></Field>
      <Field label="Less"><input data-testid="deal-less-input" inputMode="decimal" value={form.less_amount} onChange={on('less_amount')} className={`${input} money-field-input`} placeholder="₹ 0" /></Field>
    </div>
    <Field label="Commission (optional)"><input data-testid="deal-commission-input" inputMode="decimal" value={form.commission} onChange={on('commission')} className={`${input} money-field-input`} placeholder="₹ 0" /></Field>
    <p data-testid="deal-net-preview" className="deal-net-preview font-semibold" aria-live="polite">{breakdown}</p>

    <button type="button" data-testid="deal-more-toggle" aria-expanded={more} onClick={() => setMore((value) => !value)} className="more-details-toggle">
      <span>{more ? 'Hide details' : 'More details'}</span><span aria-hidden="true">{more ? '−' : '+'}</span>
    </button>
    {more && <div className="more-details rise" data-testid="deal-more-section">
      <div className="grid grid-cols-2 gap-3">
        <div className="form-field"><span className="form-field-label">Platform</span><PlatformCombobox value={form.platform} onChange={(platform) => setForm((current) => ({ ...current, platform }))} /></div>
        <Field label="Date taken"><input data-testid="deal-date-input" type="date" value={form.date_taken} onChange={on('date_taken')} className={input} /></Field>
        <Field label="Deal type"><select data-testid="deal-type-select" value={form.deal_type} onChange={on('deal_type')} className={input}>
          <option value="review">Review</option><option value="rating_only">Rating only</option><option value="review_photo">Review + photo</option>
          <option value="review_video">Review + video</option><option value="other">Other</option>
        </select></Field>
        <Field label="Review deadline"><input data-testid="deal-review-deadline-input" type="date" value={form.review_deadline} onChange={on('review_deadline')} className={input} /></Field>
        <Field label="Form deadline"><input data-testid="deal-form-deadline-input" type="date" value={form.refund_form_deadline} onChange={on('refund_form_deadline')} className={input} /></Field>
      </div>
      <Field label="Payment status"><select data-testid="deal-payment-status-select" value={form.payment_status} onChange={on('payment_status')} className={input}>
        <option value="pending">Pending</option><option value="received">Received</option><option value="disputed">Disputed</option>
      </select></Field>
      <Field label="Notes"><textarea data-testid="deal-notes-input" value={form.notes} onChange={on('notes')} rows={3} maxLength={2000} className={`${input} py-3`} /></Field>
    </div>}
    {error && <p data-testid="deal-form-error" role="alert" className="form-error">{error}</p>}
    <div className={`deal-form-submit ${modal ? 'is-sticky' : ''}`}>
      <button data-testid="deal-save-button" type="submit" className={`${btn.primary} w-full`}>{deal ? 'Save changes' : 'Save deal'}</button>
    </div>
  </form>
}
