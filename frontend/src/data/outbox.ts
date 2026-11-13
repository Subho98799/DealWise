import { db } from './db'
import { dealSnapshot } from './snapshot'
import type { OutboxOp } from './types'

let clockOffsetMs = 0
/** Server-aligned "now" so last-write-wins compares like with like across devices. */
export const nowIso = () => new Date(Date.now() + clockOffsetMs).toISOString()
export const setClockOffset = (ms: number) => { clockOffsetMs = ms }

export const uuid = () => crypto.randomUUID()

export async function enqueue(op: Omit<OutboxOp, 'seq' | 'op_id' | 'status' | 'client_updated_at'>): Promise<OutboxOp> {
  const full: OutboxOp = { ...op, op_id: uuid(), status: 'pending', client_updated_at: nowIso() }
  full.seq = await db.outbox.add(full)
  return full
}

/** Pending operations in the exact order they were made. */
export const pendingOps = (limit = 100) => db.outbox.where('status').equals('pending').limit(limit).sortBy('seq')
export const rejectedOps = () => db.outbox.where('status').equals('rejected').sortBy('seq')
export const discardOp = (seq: number) => db.outbox.delete(seq)

/**
 * Stuck rejected deal edits become one fresh full-snapshot op per deal, so updating or reloading
 * the app repairs them without walking through every card. Returns the products it re-queued.
 */
export async function repairRejectedDeals(): Promise<string[]> {
  const rejected = await db.outbox.where('status').equals('rejected').toArray()
  const stuck = new Map<string, OutboxOp[]>()
  for (const op of rejected) {
    if (op.type !== 'deal' || op.op !== 'upsert') continue
    stuck.set(op.id, [...(stuck.get(op.id) ?? []), op])
  }
  const repaired: string[] = []
  for (const [id, ops] of stuck) {
    const deal = await db.deals.get(id)
    if (!deal) {
      // The deal is gone locally, so the rejected edit has nothing left to repair.
      await db.outbox.bulkDelete(ops.map((op) => op.seq!))
      continue
    }
    await db.transaction('rw', [db.outbox], async () => {
      await db.outbox.bulkDelete(ops.map((op) => op.seq!))
      await enqueue({ type: 'deal', op: 'upsert', id, ...(deal.client_id ? { client_id: deal.client_id } : {}),
        data: dealSnapshot(deal), label: deal.product })
    })
    repaired.push(deal.product)
  }
  return repaired
}
