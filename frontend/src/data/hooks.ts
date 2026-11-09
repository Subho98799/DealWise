import { createContext, useContext, useMemo, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { evaluate, isCompleted, netPaise } from '../lib/rules'
import { toPaise } from '../lib/money'
import { todayIn } from '../lib/dates'
import { engine } from '../sync/engine'
import type { Deal, Me } from './types'

export const UserContext = createContext<Me | null>(null)
export function useUser(): Me {
  const me = useContext(UserContext)
  if (!me) throw new Error('useUser outside the protected layout')
  return me
}

export function useToday(): string {
  return todayIn(useUser().timezone)
}

export const useDeals = () => useLiveQuery(() => db.deals.toArray(), [])
export const useDeal = (id: string | undefined) => useLiveQuery(() => (id ? db.deals.get(id) : undefined), [id])
export const useMediators = () => useLiveQuery(() => db.mediators.orderBy('name').toArray(), [])
export const useRejected = () => useLiveQuery(() => db.outbox.where('status').equals('rejected').toArray(), [])
export const useSyncStatus = () => useSyncExternalStore(engine.subscribe, engine.getStatus)

export type MediatorStats = { pendingPaise: number; openCount: number }
export function mediatorStats(deals: Deal[]): Map<string, MediatorStats> {
  const out = new Map<string, MediatorStats>()
  for (const d of deals) {
    if (!d.mediator_id) continue
    const s = out.get(d.mediator_id) ?? { pendingPaise: 0, openCount: 0 }
    if (d.payment_status !== 'received') s.pendingPaise += toPaise(d.refund_amount)
    if (!isCompleted(d)) s.openCount += 1
    out.set(d.mediator_id, s)
  }
  return out
}

/** Same numbers as GET /api/summary, computed from the local replica so Home works offline. */
export function useSummary(deals: Deal[] | undefined) {
  const me = useUser()
  const today = useToday()
  return useMemo(() => {
    if (!deals) return undefined
    let paid = 0, pending = 0, received = 0, open = 0, urgent = 0, overdue = 0
    for (const d of deals) {
      paid += toPaise(d.amount_paid)
      if (d.payment_status === 'received') received += toPaise(d.refund_amount)
      else pending += toPaise(d.refund_amount)
      if (!isCompleted(d)) open += 1
      const u = evaluate(d, today, me.alert_days)
      if (u.isUrgent) urgent += 1
      if (u.isOverdue) overdue += 1
    }
    const gainLoss = deals.reduce((sum, d) => sum + netPaise(d), 0)
    return { paid, pending, received, open, urgent, overdue, gainLoss }
  }, [deals, today, me.alert_days])
}
