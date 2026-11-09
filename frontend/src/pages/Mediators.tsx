import { useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, MessageCircle, PencilLine, Trash2, UsersRound } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { mediatorStats, useDeals, useMediators } from '../data/hooks'
import { createMediator, deleteMediator, renameMediator } from '../data/mutations'
import { DealCard } from '../components/DealCard'
import { Avatar } from '../components/Avatar'
import { btn, Empty, input, PageTitle, Skeleton } from '../components/ui'
import { formatINR, toPaise } from '../lib/money'
import type { Deal } from '../data/types'
import { numberDeals } from '../lib/dealNumbers'

function whatsappNumber(contact: string | null): string | null {
  if (!contact) return null
  let digits = contact.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 10) digits = `91${digits}`
  else if (digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`
  return digits.length >= 11 && digits.length <= 15 ? digits : null
}

function reminderHref(name: string, contact: string | null, pending: Deal[]) {
  const number = whatsappNumber(contact)
  if (!number || pending.length === 0) return null
  const rows = pending.map((deal) => `\u2022 ${deal.product}: Net refund ${formatINR(deal.refund_amount)}`)
  const total = pending.reduce((sum, deal) => sum + toPaise(deal.refund_amount), 0)
  const message = `Hi ${name}, could you share an update on these pending net refunds?\n\n${rows.join('\n')}\n\nTotal net refund pending: ${formatINR(total)}\n\nThank you!`
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

export function MediatorsPage() {
  const meds = useMediators()
  const deals = useDeals()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const stats = useMemo(() => mediatorStats(deals ?? []), [deals])
  const add = async (event: FormEvent) => {
    event.preventDefault()
    const clean = name.trim()
    if (!clean) return setError('Enter a name.')
    if (meds?.some((mediator) => mediator.name.toLowerCase() === clean.toLowerCase())) return setError('That mediator already exists.')
    setName('')
    setError(null)
    await createMediator(clean)
  }
  return (
    <div data-testid="mediators-page" className="mediators-page">
      <PageTitle>Mediators</PageTitle>
      <section className="mediator-add-card">
        <div className="mediator-section-title"><span className="mediator-section-icon"><UsersRound size={19} aria-hidden="true" /></span><div><h2>Add a mediator</h2><p>Keep every contact and deal in one place.</p></div></div>
        <form onSubmit={add} className="mediator-add-form">
          <input data-testid="mediator-name-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Mediator name" className={input} maxLength={120} aria-label="New mediator name" />
          <button data-testid="mediator-add-button" className={btn.primary}>Add</button>
        </form>
        {error && <p role="alert" data-testid="mediator-error" className="mt-2 text-sm font-semibold text-danger">{error}</p>}
      </section>
      {!meds || !deals ? <Skeleton rows={3} className="mt-4" /> : meds.length ? <ul className="mediator-list">
        {meds.map((mediator) => {
          const theirDeals = deals.filter((deal) => deal.mediator_id === mediator.id)
          const pending = theirDeals.filter((deal) => deal.payment_status !== 'received')
          const summary = stats.get(mediator.id)
          const href = reminderHref(mediator.name, mediator.contact, pending)
          return <li key={mediator.id} className="mediator-card" data-testid="mediator-card">
            <Link to={`/mediators/${mediator.id}`} data-testid="mediator-row" className="mediator-card-main">
              <Avatar name={mediator.name} url={null} size={48} />
              <span className="mediator-card-info"><b>{mediator.name}</b><span>{summary?.openCount ?? 0} open deal{summary?.openCount === 1 ? '' : 's'}</span></span>
              <span className="mediator-card-money"><b className="money">{formatINR(summary?.pendingPaise ?? 0)}</b><span>net refund pending</span></span>
              <ArrowRight size={17} aria-hidden="true" className="mediator-card-arrow" />
            </Link>
            {href && <a className="mediator-remind-link" data-testid="mediator-whatsapp-reminder" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open WhatsApp reminder for ${mediator.name}`}>
              <MessageCircle size={16} aria-hidden="true" /> Remind on WhatsApp <span className="sr-only">(opens an editable prefilled message)</span>
            </a>}
          </li>
        })}
      </ul> : <Empty title="No mediators yet" testId="mediators-empty">They are also created when you type a new name while adding a deal.</Empty>}
    </div>
  )
}

export function MediatorDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const meds = useMediators()
  const deals = useDeals()
  const numbering = useMemo(() => deals ? numberDeals(deals) : undefined, [deals])
  const mediator = meds?.find((item) => item.id === id)
  const [name, setName] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  if (!meds || !deals) return <Skeleton rows={3} />
  if (!mediator) return <Empty title="Mediator not found" testId="mediator-not-found"><Link to="/mediators" className="font-bold text-primary">Back to mediators</Link></Empty>
  const theirs = deals.filter((deal) => deal.mediator_id === mediator.id)
  const pending = theirs.filter((deal) => deal.payment_status !== 'received')
  const summary = mediatorStats(theirs).get(mediator.id)
  const href = reminderHref(mediator.name, mediator.contact, pending)
  return (
    <div data-testid="mediator-detail" className="mediator-detail-page">
      <PageTitle><span data-testid="mediator-detail-name">{mediator.name}</span></PageTitle>
      <section className="mediator-detail-hero">
        <Avatar name={mediator.name} url={null} size={60} />
        <div className="mediator-detail-identity"><span className="section-eyebrow">Mediator overview</span><strong>{mediator.name}</strong><span>{mediator.contact || 'No contact saved'}</span></div>
        {href && <a className="mediator-remind-button" data-testid="mediator-whatsapp-reminder" href={href} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} aria-hidden="true" /> Remind</a>}
      </section>
      <div className="mediator-stat-grid" aria-label="Mediator totals">
        <div><span>Pending net refund</span><strong className="money">{formatINR(summary?.pendingPaise ?? 0)}</strong></div>
        <div><span>Open deals</span><strong>{summary?.openCount ?? 0}</strong></div>
        <div><span>Total deals</span><strong>{theirs.length}</strong></div>
      </div>
      <section className="mediator-detail-section">
        <div className="mediator-section-title"><span className="mediator-section-icon"><PencilLine size={18} aria-hidden="true" /></span><div><h2>Contact name</h2><p>Update how this mediator appears in your deals.</p></div></div>
        <form className="mediator-rename-form" onSubmit={async (event) => {
          event.preventDefault()
          const clean = name?.trim()
          if (!clean) return
          if (meds.some((item) => item.id !== mediator.id && item.name.toLowerCase() === clean.toLowerCase())) return setRenameError('Another mediator already has that name.')
          setRenameError(null)
          setName(null)
          await renameMediator(mediator.id, clean)
        }}>
          <input data-testid="mediator-rename-input" aria-label="Mediator name" value={name ?? mediator.name} onChange={(event) => setName(event.target.value)} className={input} maxLength={120} />
          <button data-testid="mediator-rename-button" className={btn.ghost} disabled={!name || name.trim() === mediator.name}>Save</button>
        </form>
        {renameError && <p role="alert" data-testid="mediator-rename-error" className="mt-2 text-sm font-semibold text-danger">{renameError}</p>}
      </section>
      <section className="mediator-deals-section">
        <div className="mediator-deals-heading"><div><span className="section-eyebrow">History</span><h2 className="section-title">Deals</h2></div><span className="deal-progress-count">{theirs.length}</span></div>
        <div className="space-y-3">{theirs.length ? theirs.map((deal) => <DealCard key={deal.id} deal={deal} number={numbering!.byId.get(deal.id)!} />) : <Empty title="No deals with this mediator">Add a deal and choose this mediator to see it here.</Empty>}</div>
      </section>
      <section className="mediator-danger-zone">
        <div><h2>Delete mediator</h2><p>Existing deals will keep their saved mediator name.</p></div>
        {!confirm ? <button data-testid="mediator-delete-button" className={`${btn.danger} flex items-center gap-2`} onClick={() => setConfirm(true)}><Trash2 size={16} aria-hidden="true" />Delete</button> : (
          <div className="flex w-full gap-2">
            <button className={`${btn.ghost} flex-1`} onClick={() => setConfirm(false)}>Cancel</button>
            <button data-testid="mediator-delete-confirm-button" className={`${btn.danger} flex-1`} onClick={async () => { await deleteMediator(mediator.id); navigate('/mediators', { replace: true }) }}>Yes, delete</button>
          </div>
        )}
      </section>
    </div>
  )
}
