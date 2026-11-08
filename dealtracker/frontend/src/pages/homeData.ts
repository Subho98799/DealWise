import { netPaise } from '../lib/rules'
import { toPaise } from '../lib/money'
import type { Deal } from '../data/types'

export type MonthlySummary = { key: string; label: string; paid: number; refunded: number; profit: number; hasData: boolean }

export function monthlyOverview(deals: Deal[], today: string): MonthlySummary[] {
  const [year, month] = today.slice(0, 7).split('-').map(Number)
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(year, month - 1 - (5 - index), 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return {
      key,
      label: new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date),
      paid: 0,
      refunded: 0,
      profit: 0,
      hasData: false,
    }
  })
  const byKey = new Map(months.map((item) => [item.key, item]))
  for (const deal of deals) {
    const month = byKey.get(deal.date_taken.slice(0, 7))
    if (!month) continue
    month.hasData = true
    month.paid += toPaise(deal.amount_paid)
    if (deal.payment_status === 'received') {
      month.refunded += toPaise(deal.refund_amount)
      month.profit += netPaise(deal)
    }
  }
  return months
}
