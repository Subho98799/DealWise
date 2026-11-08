import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, local, openFor, wipeLocal } from '../data/db'
import { enqueue, pendingOps } from '../data/outbox'
import { createDeal, updateDeal } from '../data/mutations'
import { SyncEngine } from './engine'
import { ApiError, TimeoutError } from '../lib/api'

type Call = { path: string; init?: { json?: { ops: { op_id: string; id: string; data: Record<string, unknown> }[] } } }

function fakeServer() {
  const seen = new Set<string>()
  const calls: Call[] = []
  const state = { rejectNext: null as string | null, fail: null as Error | null }
  const fetcher = vi.fn(async (path: string, init?: Call['init']) => {
    calls.push({ path, init })
    if (state.fail) throw state.fail
    if (path === '/api/sync/push') {
      return { results: init!.json!.ops.map((o) => {
        if (state.rejectNext) { const reason = state.rejectNext; state.rejectNext = null; return { op_id: o.op_id, status: 'rejected', reason } }
        const dup = seen.has(o.op_id); seen.add(o.op_id)
        return { op_id: o.op_id, status: dup ? 'duplicate' : 'applied', id: o.id }
      }) }
    }
    return { server_time: '2026-06-10T00:00:00Z', deals: [], mediators: [], deleted: { deals: [], mediators: [] } }
  })
  return { fetcher, calls, state }
}

const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v })

beforeEach(async () => { await wipeLocal(); await openFor('user-a'); setOnline(true) })

describe('outbox', () => {
  it('keeps operations in creation order with unique op_ids', async () => {
    const d = await createDeal({ product: 'First', date_taken: '2026-06-10', mediator_name: 'Ravi' })
    await updateDeal(d.id, { product: 'Second' })
    const ops = await pendingOps()
    expect(ops.map((o) => `${o.type}:${o.op}`)).toEqual(['mediator:upsert', 'deal:upsert', 'deal:upsert'])
    expect(new Set(ops.map((o) => o.op_id)).size).toBe(3)
    expect(ops[2].data).toEqual({ product: 'Second' })
    expect((await db.deals.get(d.id))?.product).toBe('Second') // applied locally first
  })
})

describe('sync engine', () => {
  it('stays pending while offline, then pushes in order once online; re-sending the same op is idempotent', async () => {
    const srv = fakeServer()
    const engine = new SyncEngine(srv.fetcher as never)
    await enqueue({ type: 'deal', op: 'upsert', id: 'a', data: { product: 'A' } })
    await enqueue({ type: 'deal', op: 'upsert', id: 'b', data: { product: 'B' } })
    setOnline(false)
    await engine.sync()
    expect(engine.status).toMatchObject({ state: 'offline', pending: 2 })
    expect(srv.fetcher).not.toHaveBeenCalled()
    setOnline(true)
    const ops = await pendingOps()
    await engine.sync()
    expect(srv.calls[0].init!.json!.ops.map((o) => o.id)).toEqual(['a', 'b'])
    expect(engine.status).toMatchObject({ state: 'synced', pending: 0 })
    // a lost response means the same op_ids are sent again: server answers duplicate, op is cleared
    await db.outbox.bulkAdd(ops.map(({ seq: _s, ...o }) => o))
    await engine.sync()
    expect(await db.outbox.count()).toBe(0)
  })

  it('marks only explicit server rejections as needing attention; stale means server wins', async () => {
    const srv = fakeServer()
    const engine = new SyncEngine(srv.fetcher as never)
    await enqueue({ type: 'deal', op: 'upsert', id: 'a', data: { product: '' } })
    srv.state.rejectNext = 'product: String should have at least 1 character'
    await engine.sync()
    expect(engine.status).toMatchObject({ state: 'attention', rejected: 1, pending: 0 })
    expect((await db.outbox.toArray())[0]).toMatchObject({ status: 'rejected', reason: expect.stringContaining('product') })
    await db.outbox.clear()
    await enqueue({ type: 'deal', op: 'upsert', id: 'b', data: { product: 'old' } })
    srv.state.rejectNext = 'stale: a newer version exists on the server'
    await engine.sync()
    expect(await db.outbox.count()).toBe(0)
    expect(engine.status.state).toBe('synced')
  })

  it('a cold-start timeout or network error never fails operations and retries with backoff', async () => {
    const srv = fakeServer()
    const engine = new SyncEngine(srv.fetcher as never, { wakingAfterMs: 0, debounceMs: 10, intervalMs: 60_000, retryBaseMs: 50 })
    await enqueue({ type: 'deal', op: 'upsert', id: 'a', data: { product: 'A' } })
    srv.state.fail = new TimeoutError('slow')
    await engine.sync()
    expect(engine.status).toMatchObject({ state: 'waking', pending: 1, rejected: 0 })
    expect((await db.outbox.toArray())[0].status).toBe('pending')
    srv.state.fail = null
    await new Promise((r) => setTimeout(r, 400)) // first backoff step (scaled down from 2 s)
    expect(await db.outbox.count()).toBe(0)
    expect(engine.status.state).toBe('synced')
    engine.stop()
  })

  it('a 401 stops and asks for login without touching the outbox', async () => {
    const srv = fakeServer()
    const engine = new SyncEngine(srv.fetcher as never)
    const onUnauth = vi.fn()
    engine.onUnauthorized = onUnauth
    await enqueue({ type: 'deal', op: 'upsert', id: 'a', data: { product: 'A' } })
    srv.state.fail = new ApiError(401, 'not_authenticated', 'Please log in.')
    await engine.sync()
    expect(onUnauth).toHaveBeenCalled()
    expect(await db.outbox.count()).toBe(1)
  })
})

describe('account safety', () => {
  it('wipes everything on logout', async () => {
    await createDeal({ product: 'Secret', date_taken: '2026-06-10', mediator_name: 'Ravi' })
    local.set('me', '{"id":"user-a"}')
    await wipeLocal()
    expect(await db.deals.count()).toBe(0)
    expect(await db.mediators.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
    expect(local.get('me')).toBeNull()
  })
  it('wipes the previous owner on account switch', async () => {
    await createDeal({ product: 'A secret', date_taken: '2026-06-10' })
    await openFor('user-b')
    expect(await db.deals.count()).toBe(0)
    await openFor('user-b')
    await createDeal({ product: 'B deal', date_taken: '2026-06-10' })
    await openFor('user-b')
    expect(await db.deals.count()).toBe(1) // same user keeps their data
  })
})
