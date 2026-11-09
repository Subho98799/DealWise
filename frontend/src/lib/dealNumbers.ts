import type { Deal } from '../data/types'

export type DealNumbering = { byId: Map<string, number>; total: number }
type NumberableDeal = Pick<Deal, 'id' | 'date_taken' | 'created_at'>

export function numberDeals(deals: readonly NumberableDeal[]): DealNumbering {
  const ordered = [...deals].sort((a, b) => {
    const dateOrder = a.date_taken.localeCompare(b.date_taken)
    if (dateOrder) return dateOrder
    const aCreated = Date.parse(a.created_at)
    const bCreated = Date.parse(b.created_at)
    if (Number.isFinite(aCreated) && Number.isFinite(bCreated) && aCreated !== bCreated) {
      return aCreated - bCreated
    }
    if (!Number.isFinite(aCreated) || !Number.isFinite(bCreated)) {
      const timestampOrder = a.created_at.localeCompare(b.created_at)
      if (timestampOrder) return timestampOrder
    }
    return a.id.localeCompare(b.id)
  })
  return {
    byId: new Map(ordered.map((deal, index) => [deal.id, index + 1])),
    total: ordered.length,
  }
}
