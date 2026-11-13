import { useId, useMemo, useRef, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { PlatformBadge } from './PlatformBadge'
import { useDeals } from '../data/hooks'
import { mergePlatforms, POPULAR_PLATFORMS, platformSlug } from '../lib/platforms'

export function PlatformCombobox({ value, onChange, testId = 'deal-platform-input' }: {
  value: string
  onChange: (value: string) => void
  testId?: string
}) {
  const deals = useDeals()
  const listId = useId()
  const fieldRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const [maxHeight, setMaxHeight] = useState(260)
  const options = useMemo(() => mergePlatforms([
    ...POPULAR_PLATFORMS,
    ...[...(deals ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((deal) => deal.platform),
  ]), [deals])
  const query = value.trim()
  const needle = query.toLowerCase()
  const filtered = options.filter((platform) => platform.toLowerCase().includes(needle))
  const exact = options.find((platform) => platformSlug(platform) === platformSlug(query))
  const commitTyped = () => {
    const text = value.trim()
    if (!text) {
      if (value) onChange('')
      return
    }
    const next = options.find((platform) => platformSlug(platform) === platformSlug(text)) ?? text
    if (next !== value) onChange(next)
  }
  const choose = (platform: string) => {
    onChange(platform)
    setOpen(false)
  }
  const openList = () => {
    const rect = fieldRef.current?.getBoundingClientRect()
    if (rect) {
      const viewport = window.visualViewport?.height ?? window.innerHeight
      const below = viewport - rect.bottom - 14
      const above = rect.top - 14
      const up = below < 190 && above > below
      setDropUp(up)
      setMaxHeight(Math.max(132, Math.min(300, up ? above : below)))
    }
    setOpen(true)
  }

  return <div className="platform-combobox"
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { commitTyped(); setOpen(false) } }}>
    <div ref={fieldRef} className="platform-combobox-field">
      <PlatformBadge platform={value || undefined} size={26} />
      <input data-testid={testId} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-label="Platform"
        value={value} placeholder="Search or add a platform" className="platform-combobox-input"
        onChange={(event) => { onChange(event.target.value); openList() }}
        onFocus={openList}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && open) {
            event.preventDefault()
            if (filtered.length === 1) choose(filtered[0])
            else if (query && !exact) choose(query)
            else setOpen(false)
          }
          if (event.key === 'Escape') setOpen(false)
        }} />
      <Search size={16} aria-hidden="true" className="platform-combobox-search" />
    </div>
    {open && <ul id={listId} role="listbox" className={`platform-options ${dropUp ? 'is-up' : ''}`} style={{ maxHeight }}>
      {filtered.map((platform) => <li key={platformSlug(platform)} role="option" aria-selected={platformSlug(platform) === platformSlug(value)}>
        <button type="button" tabIndex={-1} data-testid={`platform-option-${platformSlug(platform)}`}
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(platform)}>
          <PlatformBadge platform={platform} size={24} /><span className="platform-option-label">{platform}</span>
          {platformSlug(platform) === platformSlug(value) && <span className="platform-option-check" aria-hidden="true">✓</span>}
        </button>
      </li>)}
      {query && !exact && <li role="option" aria-selected={false}>
        <button type="button" tabIndex={-1} data-testid="platform-option-add" className="platform-option-add"
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(query)}>
          <span className="platform-option-add-icon" aria-hidden="true"><Plus size={16} /></span>
          <span className="platform-option-label">Add “{query}”</span>
        </button>
      </li>}
    </ul>}
  </div>
}
