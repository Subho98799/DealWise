import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDeals, useToday, useUser } from '../data/hooks'
import { DealCard } from '../components/DealCard'
import { Empty, PageTitle, Skeleton, input } from '../components/ui'
import { CHIPS, matchesChip, sortDeals, type Chip, type Sort } from '../lib/rules'
import { Link } from 'react-router-dom'

export default function DealsPage() {
  const me = useUser()
  const today = useToday()
  const deals = useDeals()
  const [params, setParams] = useSearchParams()
  const chip = (params.get('chip') as Chip) || 'all'
  const sort = (params.get('sort') as Sort) || 'urgency'
  const q = params.get('q') ?? ''
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }) }

  const list = useMemo(() => {
    if (!deals) return undefined
    const needle = q.trim().toLowerCase()
    const filtered = deals.filter((d) => matchesChip(d, chip, today, me.alert_days) &&
      (!needle || d.product.toLowerCase().includes(needle) || (d.notes ?? '').toLowerCase().includes(needle)))
    return sortDeals(filtered, sort)
  }, [deals, chip, sort, q, today, me.alert_days])

  return (
    <div data-testid="deals-page">
      <PageTitle>Deals</PageTitle>
      <div className="flex gap-2">
        <input data-testid="deals-search-input" value={q} onChange={(e) => set('q', e.target.value)} placeholder="Search product or notes" className={input} />
        <select data-testid="deals-sort-select" value={sort} onChange={(e) => set('sort', e.target.value)} className={`${input} w-auto`} aria-label="Sort">
          <option value="urgency">Urgent first</option>
          <option value="newest">Newest</option>
          <option value="amount">Amount</option>
        </select>
      </div>
      <div className="-mx-gutter mt-3 flex gap-2 overflow-x-auto px-gutter pb-1">
        {CHIPS.map(([id, label]) => (
          <button key={id} data-testid={`chip-${id}`} onClick={() => set('chip', id === 'all' ? '' : id)}
            className={`min-h-[40px] shrink-0 rounded-pill px-4 text-sm font-bold ${chip === id ? 'bg-ink text-bg' : 'bg-surface text-muted shadow-card'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-3" data-testid="deals-list">
        {!list ? <Skeleton /> : list.length ? list.map((d) => <DealCard key={d.id} deal={d} />) : (
          <Empty title={deals?.length ? 'No deals match' : 'No deals yet'} testId="deals-empty">
            {deals?.length ? 'Try another filter or search.' : <><span>Tap + to add your first deal, or </span><Link to="/import" data-testid="deals-import-link" className="font-bold text-primary">import a spreadsheet</Link><span>.</span></>}
          </Empty>
        )}
      </div>
    </div>
  )
}
