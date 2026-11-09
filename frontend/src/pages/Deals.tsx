import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUpDown, Check, Search, X } from 'lucide-react'
import { useDeals, useToday, useUser } from '../data/hooks'
import { DealCard } from '../components/DealCard'
import { Button, EmptyState, IconButton, PageTitle, Sheet, Skeleton } from '../components/ui'
import { CHIPS, matchesChip, sortDeals, type Chip, type Sort } from '../lib/rules'
import { numberDeals } from '../lib/dealNumbers'

const SORTS: { value: Sort; label: string; detail: string }[] = [
  { value: 'urgency', label: 'Urgent first', detail: 'Closest deadlines at the top' },
  { value: 'newest', label: 'Newest', detail: 'Recently added deals first' },
  { value: 'amount', label: 'Amount', detail: 'Highest amount paid first' },
]

export default function DealsPage() {
  const me = useUser()
  const today = useToday()
  const deals = useDeals()
  const [params, setParams] = useSearchParams()
  const [sortOpen, setSortOpen] = useState(false)
  const chip = (params.get('chip') as Chip) || 'all'
  const sort = (params.get('sort') as Sort) || 'urgency'
  const q = params.get('q') ?? ''
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const numbering = useMemo(() => deals ? numberDeals(deals) : undefined, [deals])
  const list = useMemo(() => {
    if (!deals) return undefined
    const needle = q.trim().toLowerCase()
    const numberQuery = /^#?\d+$/.test(needle) ? Number(needle.replace(/^#/, '')) : null
    const filtered = deals.filter((deal) => numberQuery !== null
      ? numbering?.byId.get(deal.id) === numberQuery
      : matchesChip(deal, chip, today, me.alert_days) &&
        (!needle || deal.product.toLowerCase().includes(needle) || (deal.notes ?? '').toLowerCase().includes(needle)))
    return sortDeals(filtered, sort)
  }, [deals, numbering, chip, sort, q, today, me.alert_days])
  const counts = useMemo(() => new Map(CHIPS.map(([id]) => [id, deals?.filter((deal) => matchesChip(deal, id, today, me.alert_days)).length ?? 0])), [deals, today, me.alert_days])
  const currentSort = SORTS.find((option) => option.value === sort)?.label ?? SORTS[0].label
  const isFiltered = chip !== 'all' || !!q.trim()

  return <div data-testid="deals-page" className="deals-page">
    <PageTitle right={list && deals ? <span data-testid="deals-count" className="text-sm font-semibold text-muted">
      {isFiltered ? `${list.length} of ${deals.length}` : deals.length} {deals.length === 1 ? 'deal' : 'deals'}
    </span> : undefined}>Deals</PageTitle>
    <div className="deals-controls">
      <div className="deals-search-row">
        <div className="deals-search-field">
          <label className="sr-only" htmlFor="deals-search">Search deals</label>
          <Search size={18} aria-hidden="true" className="deals-search-icon" />
          <input id="deals-search" data-testid="deals-search-input" value={q} onChange={(event) => set('q', event.target.value)}
            placeholder="Search deals or #12" aria-label="Search product, notes or deal number" className="deals-search-input" />
          {q && <IconButton label="Clear search" className="deals-search-clear" onClick={() => set('q', '')}><X size={17} aria-hidden="true" /></IconButton>}
        </div>
        <button data-testid="deals-sort-button" aria-label={`Sort deals: ${currentSort}`} onClick={() => setSortOpen(true)} className="deals-sort-button">
          <ArrowUpDown size={17} aria-hidden="true" /><span>Sort</span>
        </button>
      </div>
      <div className="deals-filter-row" role="group" aria-label="Filter deals">
        {CHIPS.map(([id, label]) => <button key={id} data-testid={`chip-${id}`} aria-pressed={chip === id}
          onClick={() => set('chip', id === 'all' ? '' : id)} className={`filter-chip ${chip === id ? 'is-active' : ''}`}>
          <span>{label}</span><span className="filter-chip-count">{counts.get(id) ?? 0}</span>
        </button>)}
      </div>
    </div>

    <div className="mt-4 space-y-3" data-testid="deals-list">
      {!list ? <Skeleton rows={3} /> : list.length ? list.map((deal) => <DealCard key={deal.id} deal={deal} number={numbering!.byId.get(deal.id)!} />) : <EmptyState title={deals?.length ? 'No deals match' : 'No deals yet'} testId="deals-empty">
        {deals?.length ? 'Try a different filter or search.' : <><span>Tap + to add your first deal, or </span><Link to="/import" data-testid="deals-import-link" className="font-semibold text-primary">import a spreadsheet</Link><span>.</span></>}
      </EmptyState>}
    </div>

    <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title="Sort deals">
      <p className="mb-3 text-sm text-muted">Choose how your list is ordered.</p>
      <div className="space-y-2">{SORTS.map((option) => <button key={option.value} type="button" aria-pressed={sort === option.value}
        className={`sort-option ${sort === option.value ? 'is-selected' : ''}`}
        onClick={() => { set('sort', option.value === 'urgency' ? '' : option.value); setSortOpen(false) }}>
        <span><span className="block font-semibold">{option.label}</span><span className="mt-1 block text-xs text-muted">{option.detail}</span></span>
        {sort === option.value && <Check size={18} aria-hidden="true" />}
      </button>)}</div>
      <Button variant="secondary" className="mt-4 w-full" onClick={() => setSortOpen(false)}>Done</Button>
    </Sheet>
  </div>
}
