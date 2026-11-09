import { describe, expect, it } from 'vitest'
import { numberDeals } from './dealNumbers'

const deal = (id: string, date_taken: string, created_at: string) => ({ id, date_taken, created_at })

describe('deal numbering', () => {
  it('orders by date, then creation timestamp, then id', () => {
    const numbered = numberDeals([
      deal('b', '2026-01-02', '2026-01-02T00:00:00Z'),
      deal('c', '2026-01-01', '2026-01-01T00:00:00Z'),
      deal('a', '2026-01-01', '2026-01-01T00:00:00Z'),
      deal('0', '2026-01-01', '2026-01-01T01:00:00Z'),
    ])
    expect([...numbered.byId]).toEqual([['a', 1], ['c', 2], ['0', 3], ['b', 4]])
    expect(numbered.total).toBe(4)
  })

  it('renumbers after deletion and preserves full-list numbers under filters', () => {
    const full = [
      deal('a', '2026-01-01', '2026-01-01T00:00:00Z'),
      deal('b', '2026-01-02', '2026-01-02T00:00:00Z'),
      deal('c', '2026-01-03', '2026-01-03T00:00:00Z'),
    ]
    const numbering = numberDeals(full)
    const filtered = full.filter((item) => item.id !== 'a')
    expect(filtered.map((item) => numbering.byId.get(item.id))).toEqual([2, 3])
    const afterDelete = numberDeals(full.filter((item) => item.id !== 'a'))
    expect(afterDelete.byId.get('b')).toBe(1)
  })
})
