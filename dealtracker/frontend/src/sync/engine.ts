import { api, ApiError, isUnauthorized, TimeoutError } from '../lib/api'
import { db, getMeta, setMeta } from '../data/db'
import { pendingOps, setClockOffset } from '../data/outbox'
import type { Deal, Mediator, OutboxOp } from '../data/types'

export type SyncState = 'synced' | 'syncing' | 'pending' | 'offline' | 'waking' | 'attention'
export type SyncStatus = { state: SyncState; pending: number; rejected: number }
type Result = { op_id: string; status: 'applied' | 'duplicate' | 'rejected'; reason?: string | null; id?: string | null }
type Changes = { server_time: string; deals: Deal[]; mediators: Mediator[]; deleted: { deals: string[]; mediators: string[] } }
type Fetcher = typeof api

const DEAL_FIELDS: (keyof Deal)[] = ['id', 'client_id', 'product', 'platform', 'mediator_id', 'mediator_name', 'deal_type', 'date_taken',
  'amount_paid', 'refund_amount', 'commission', 'review_deadline', 'refund_form_deadline', 'review_status', 'form_status',
  'payment_status', 'payment_received_on', 'notes', 'created_at', 'updated_at']
const pick = (d: Deal) => Object.fromEntries(DEAL_FIELDS.map((k) => [k, d[k]])) as Deal
// Server-side rejections that mean "the server copy wins" (last-write-wins): drop the op, re-pull.
const SERVER_WINS = /^(stale|deleted):/

/**
 * Push the outbox in order, then pull changes since the cursor.
 * Network errors and timeouts (Render cold start) NEVER fail an operation: they just retry with backoff.
 * Only an explicit server "rejected" result marks an op as needing attention.
 */
export class SyncEngine {
  status: SyncStatus = { state: 'synced', pending: 0, rejected: 0 }
  onUnauthorized: () => void = () => {}
  private listeners = new Set<(s: SyncStatus) => void>()
  private running = false
  private again = false
  private failures = 0
  private timers: ReturnType<typeof setTimeout>[] = []
  private interval: ReturnType<typeof setInterval> | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null
  private retry: ReturnType<typeof setTimeout> | null = null
  private started = false

  constructor(private fetcher: Fetcher = api, private opts = { wakingAfterMs: 4000, debounceMs: 800, intervalMs: 60_000, retryBaseMs: 2000 }) {}

  subscribe = (fn: (s: SyncStatus) => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }
  getStatus = () => this.status
  private set(p: Partial<SyncStatus>) {
    this.status = { ...this.status, ...p }
    this.listeners.forEach((l) => l(this.status))
  }

  private onOnline = () => void this.sync()
  private onVisible = () => { if (document.visibilityState === 'visible') void this.sync() }

  start() {
    if (this.started) return
    this.started = true
    window.addEventListener('online', this.onOnline)
    window.addEventListener('offline', this.onOnline)
    document.addEventListener('visibilitychange', this.onVisible)
    this.interval = setInterval(() => { if (document.visibilityState === 'visible') void this.sync() }, this.opts.intervalMs)
    void this.sync()
  }

  stop() {
    this.started = false
    window.removeEventListener('online', this.onOnline)
    window.removeEventListener('offline', this.onOnline)
    document.removeEventListener('visibilitychange', this.onVisible)
    if (this.interval) clearInterval(this.interval)
    for (const t of [this.debounce, this.retry, ...this.timers]) if (t) clearTimeout(t)
    this.failures = 0
  }

  /** Call after every local write. */
  poke() {
    void this.refreshCounts()
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => void this.sync(), this.opts.debounceMs)
  }

  async sync(): Promise<void> {
    if (this.running) { this.again = true; return }
    this.running = true
    try {
      do { this.again = false; await this.cycle() } while (this.again)
    } finally {
      this.running = false
    }
  }

  private async refreshCounts() {
    const [pending, rejected] = await Promise.all([
      db.outbox.where('status').equals('pending').count(), db.outbox.where('status').equals('rejected').count()])
    this.set({ pending, rejected })
    return { pending, rejected }
  }

  private settle(pending: number, rejected: number): SyncState {
    return rejected ? 'attention' : pending ? 'pending' : 'synced'
  }

  private async cycle() {
    await this.refreshCounts()
    if (!navigator.onLine) { this.set({ state: 'offline' }); return }
    this.set({ state: 'syncing' })
    const waking = setTimeout(() => this.set({ state: 'waking' }), this.opts.wakingAfterMs)
    this.timers.push(waking)
    try {
      await this.push()
      await this.pull()
      this.failures = 0
      const c = await this.refreshCounts()
      this.set({ state: this.settle(c.pending, c.rejected) })
    } catch (e) {
      if (isUnauthorized(e)) { this.set({ state: 'offline' }); this.onUnauthorized(); return }
      this.failures += 1
      const delay = Math.min(this.opts.retryBaseMs * 2 ** (this.failures - 1), 60_000)
      if (this.retry) clearTimeout(this.retry)
      this.retry = setTimeout(() => void this.sync(), delay)
      this.set({ state: !navigator.onLine ? 'offline' : e instanceof TimeoutError || !(e instanceof ApiError) ? 'waking' : 'pending' })
    } finally {
      clearTimeout(waking)
    }
  }

  private async push() {
    for (;;) {
      const ops = await pendingOps(100)
      if (!ops.length) return
      const body = { ops: ops.map(({ op_id, type, op, id, client_id, data, client_updated_at }) =>
        ({ op_id, type, op, id, ...(client_id ? { client_id } : {}), data, client_updated_at })) }
      const { results } = await this.fetcher<{ results: Result[] }>('/api/sync/push', { method: 'POST', json: body })
      await this.applyResults(ops, results)
    }
  }

  private async applyResults(ops: OutboxOp[], results: Result[]) {
    const byId = new Map(results.map((r) => [r.op_id, r]))
    let resync = false
    await db.transaction('rw', [db.outbox, db.deals, db.mediators, db.meta], async () => {
      for (const op of ops) {
        const r = byId.get(op.op_id)
        if (!r) continue
        if (r.status === 'rejected' && !SERVER_WINS.test(r.reason ?? '')) {
          await db.outbox.update(op.seq!, { status: 'rejected', reason: r.reason ?? 'Rejected by the server' })
          continue
        }
        await db.outbox.delete(op.seq!)
        if (r.status === 'rejected') resync = true
        if (r.status === 'duplicate' && r.reason === 'name_exists' && r.id && r.id !== op.id) {
          await db.mediators.delete(op.id)  // same name created on another device: adopt the server's id
          await db.deals.where('mediator_id').equals(op.id).modify({ mediator_id: r.id })
          await db.outbox.where('id').anyOf(op.id).modify((o: OutboxOp) => { o.id = r.id! })
          await db.outbox.toCollection().modify((o: OutboxOp) => { if (o.data.mediator_id === op.id) o.data.mediator_id = r.id })
          resync = true
        }
      }
      if (resync) await db.meta.delete('cursor')
    })
  }

  private async pull() {
    const since = (await getMeta('cursor')) ?? ''
    const ch = await this.fetcher<Changes>(`/api/sync/changes?since=${encodeURIComponent(since)}`)
    setClockOffset(Date.parse(ch.server_time) - Date.now())
    await db.transaction('rw', [db.outbox, db.deals, db.mediators, db.meta], async () => {
      const busy = new Set((await db.outbox.toArray()).map((o) => o.id)) // never clobber unsynced local edits
      await db.deals.bulkPut(ch.deals.filter((d) => !busy.has(d.id)).map(pick))
      await db.mediators.bulkPut(ch.mediators.filter((m) => !busy.has(m.id))
        .map(({ id, name, contact, created_at, updated_at }) => ({ id, name, contact, created_at, updated_at })))
      await db.deals.bulkDelete(ch.deleted.deals.filter((id) => !busy.has(id)))
      await db.mediators.bulkDelete(ch.deleted.mediators.filter((id) => !busy.has(id)))
      if (!since) { // full pull: drop local rows the server no longer has (except unsynced ones)
        const keepD = new Set(ch.deals.map((d) => d.id))
        const keepM = new Set(ch.mediators.map((m) => m.id))
        await db.deals.filter((d) => !keepD.has(d.id) && !busy.has(d.id)).delete()
        await db.mediators.filter((m) => !keepM.has(m.id) && !busy.has(m.id)).delete()
      }
      await setMeta('cursor', ch.server_time)
    })
  }
}

export const engine = new SyncEngine()
