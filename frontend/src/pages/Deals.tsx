import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUpDown, Check, Search, X } from 'lucide-react'
import { useDeals, useToday, useUser } from '../data/hooks'
import { DealCard } from '../components/DealCard'
import { PlatformBadge } from '../components/PlatformBadge'
import { Button, EmptyState, IconButton, PageTitle, Sheet, Skeleton } from '../components/ui'
import { CHIPS, matchesChip, sortDeals, type Chip, type Sort } from '../lib/rules'
import { platformSlug } from '../lib/platforms'
import { numberDeals } from '../lib/dealNumbers'

const SORTS: { value: Sort; label: string; detail: string }[] = [
  { value: 'needs_action', label: 'Needs action', detail: 'Unfinished deals first, closest deadline on top' },
  { value: 'newest', label: 'Newest', detail: 'Recently taken deals first' },
  { value: 'oldest', label: 'Oldest', detail: 'Earliest taken deals first' },
  { value: 'refund_high', label: 'Refund high', detail: 'Highest net refund first' },
  { value: 'refund_low', label: 'Refund low', detail: 'Lowest net refund first' },
]
const SORT_KEY = 'dealbook.deals.sort'
const VALID_SORTS = new Set<Sort>(SORTS.map((option) => option.value))

function savedSort(): Sort | null {
  try {
    const value = sessionStorage.getItem(SORT_KEY) as Sort | null
    return value && VALID_SORTS.has(value) ? value : null
  } catch {
    return null
  }
}

export default function DealsPage() {
  const me = useUser()
  const today = useToday()
  const deals = useDeals()
  const [params, setParams] = useSearchParams()
  const [sortOpen, setSortOpen] = useState(false)
  const chip = (params.get('chip') as Chip) || 'all'
  const sortParam = params.get('sort') as Sort | null
  const sort = sortParam && VALID_SORTS.has(sortParam) ? sortParam : savedSort() ?? 'needs_action'
  const platform = params.get('platform') ?? ''
  const q = params.get('q') ?? ''
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const chooseSort = (value: Sort) => {
    try { sessionStorage.setItem(SORT_KEY, value) } catch { /* session storage may be unavailable */ }
    set('sort', value === 'needs_action' ? '' : value)
    setSortOpen(false)
  }

  const numbering = useMemo(() => deals ? numberDeals(deals) : undefined, [deals])
  const list = useMemo(() => {
    if (!deals) return undefined
    const needle = q.trim().toLowerCase()
    const numberQuery = /^#?\d+$/.test(needle) ? Number(needle.replace(/^#/, '')) : null
    const filtered = deals.filter((deal) => numberQuery !== null
      ? numbering?.byId.get(deal.id) === numberQuery
      : matchesChip(deal, chip, today, me.alert_days) &&
        (!platform || platformSlug(deal.platform ?? '') === platform) &&
        (!needle || deal.product.toLowerCase().includes(needle) || (deal.notes ?? '').toLowerCase().includes(needle)))
    return sortDeals(filtered, sort)
  }, [deals, numbering, chip, sort, platform, q, today, me.alert_days])
  const counts = useMemo(() => new Map(CHIPS.map(([id]) => [id, deals?.filter((deal) => matchesChip(deal, id, today, me.alert_days)).length ?? 0])), [deals, today, me.alert_days])
  const platforms = useMemo(() => {
    if (!deals) return []
    const map = new Map<string, { name: string; count: number }>()
    for (const deal of [...deals].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const name = deal.platform?.trim()
      if (!name) continue
      const slug = platformSlug(name)
      const entry = map.get(slug) ?? { name, count: 0 }
      entry.count += 1
      map.set(slug, entry)
    }
    return [...map.entries()].map(([slug, entry]) => ({ slug, ...entry })).sort((a, b) => a.name.localeCompare(b.name))
  }, [deals])
  const currentSort = SORTS.find((option) => option.value === sort)?.label ?? SORTS[0].label
  const isFiltered = chip !== 'all' || !!q.trim() || !!platform

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
          <ArrowUpDown size={17} aria-hidden="true" /><span>{currentSort}</span>
        </button>
      </div>
      <div className="deals-filter-row" role="group" aria-label="Filter deals">
        {CHIPS.map(([id, label]) => <button key={id} data-testid={`chip-${id}`} aria-pressed={chip === id}
          onClick={() => set('chip', id === 'all' ? '' : id)} className={`filter-chip ${chip === id ? 'is-active' : ''}`}>
          <span>{label}</span><span className="filter-chip-count">{counts.get(id) ?? 0}</span>
        </button>)}
      </div>
      {platforms.length > 0 && <div className="deals-filter-row platform-filter-row" role="group" aria-label="Filter by platform">
        <button data-testid="platform-filter-all" aria-pressed={!platform} onClick={() => set('platform', '')}
          className={`filter-chip ${!platform ? 'is-active' : ''}`}><span>All platforms</span></button>
        {platforms.map((item) => <button key={item.slug} data-testid={`platform-filter-${item.slug}`} aria-pressed={platform === item.slug}
          onClick={() => set('platform', platform === item.slug ? '' : item.slug)} className={`filter-chip ${platform === item.slug ? 'is-active' : ''}`}>
          <PlatformBadge platform={item.name} size={20} /><span>{item.name}</span><span className="filter-chip-count">{item.count}</span>
        </button>)}
      </div>}
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
        onClick={() => chooseSort(option.value)}>
        <span><span className="block font-semibold">{option.label}</span><span className="mt-1 block text-xs text-muted">{option.detail}</span></span>
        {sort === option.value && <Check size={18} aria-hidden="true" />}
      </button>)}</div>
      <Button variant="secondary" className="mt-4 w-full" onClick={() => setSortOpen(false)}>Done</Button>
    </Sheet>
  </div>
}
