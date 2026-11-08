import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { mediatorStats, useDeals, useMediators } from '../data/hooks'
import { createMediator, deleteMediator, renameMediator } from '../data/mutations'
import { DealCard } from '../components/DealCard'
import { btn, Empty, input, PageTitle, Skeleton } from '../components/ui'
import { formatINR } from '../lib/money'

export function MediatorsPage() {
  const meds = useMediators()
  const deals = useDeals()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const stats = mediatorStats(deals ?? [])
  const add = async (e: FormEvent) => {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return setError('Enter a name.')
    if (meds?.some((m) => m.name.toLowerCase() === clean.toLowerCase())) return setError('That mediator already exists.')
    await createMediator(clean)
    setName(''); setError(null)
  }
  return (
    <div data-testid="mediators-page">
      <PageTitle>Mediators</PageTitle>
      <form onSubmit={add} className="flex gap-2">
        <input data-testid="mediator-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New mediator name" className={input} maxLength={120} />
        <button data-testid="mediator-add-button" className={btn.primary}>Add</button>
      </form>
      {error && <p role="alert" data-testid="mediator-error" className="mt-2 text-sm font-semibold text-danger">{error}</p>}
      <ul className="mt-4 space-y-3">
        {!meds ? <Skeleton /> : meds.length ? meds.map((m) => {
          const s = stats.get(m.id)
          return (
            <li key={m.id}>
              <Link to={`/mediators/${m.id}`} data-testid="mediator-row" className="flex min-h-[64px] items-center justify-between rounded-lg bg-surface px-4 shadow-card">
                <span className="font-bold">{m.name}</span>
                <span className="text-right text-xs text-muted">
                  <b className="block text-sm text-ink">{formatINR(s?.pendingPaise ?? 0)} pending</b>{s?.openCount ?? 0} open
                </span>
              </Link>
            </li>
          )
        }) : <Empty title="No mediators yet" testId="mediators-empty">They are also created when you type a new name while adding a deal.</Empty>}
      </ul>
    </div>
  )
}

export function MediatorDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const meds = useMediators()
  const deals = useDeals()
  const m = meds?.find((x) => x.id === id)
  const [name, setName] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  if (!meds) return <Skeleton />
  if (!m) return <Empty title="Mediator not found" testId="mediator-not-found"><Link to="/mediators" className="font-bold text-primary">Back</Link></Empty>
  const theirs = (deals ?? []).filter((d) => d.mediator_id === m.id)
  const s = mediatorStats(theirs).get(m.id)
  return (
    <div data-testid="mediator-detail" className="space-y-5">
      <PageTitle><span data-testid="mediator-detail-name">{m.name}</span></PageTitle>
      <p className="text-sm text-muted">{formatINR(s?.pendingPaise ?? 0)} pending · {s?.openCount ?? 0} open deals</p>
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (name?.trim()) { await renameMediator(m.id, name.trim()); setName(null) } }}>
        <input data-testid="mediator-rename-input" value={name ?? m.name} onChange={(e) => setName(e.target.value)} className={input} maxLength={120} />
        <button data-testid="mediator-rename-button" className={btn.ghost} disabled={!name || name.trim() === m.name}>Rename</button>
      </form>
      <div className="space-y-3">{theirs.length ? theirs.map((d) => <DealCard key={d.id} deal={d} />) : <Empty title="No deals with this mediator" />}</div>
      {!confirm ? <button data-testid="mediator-delete-button" className={`${btn.danger} w-full`} onClick={() => setConfirm(true)}>Delete mediator</button> : (
        <div className="space-y-2">
          <p className="text-sm text-muted">Deals keep showing “{m.name}”.</p>
          <div className="flex gap-2">
            <button className={`${btn.ghost} flex-1`} onClick={() => setConfirm(false)}>Cancel</button>
            <button data-testid="mediator-delete-confirm-button" className={`${btn.danger} flex-1`}
              onClick={async () => { await deleteMediator(m.id); navigate('/mediators', { replace: true }) }}>Yes, delete</button>
          </div>
        </div>
      )}
    </div>
  )
}
