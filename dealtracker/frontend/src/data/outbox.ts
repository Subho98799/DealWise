import { db } from './db'
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
