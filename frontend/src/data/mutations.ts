// Every write: apply locally first, queue an outbox op, poke the sync engine. Never waits on the network.
import { db, local } from './db'
import { enqueue, nowIso, uuid } from './outbox'
import { applyAction, type Action } from '../lib/rules'
import { fromPaise, toPaise } from '../lib/money'
import type { Deal, Mediator } from './types'
import { engine } from '../sync/engine'

export type DealDraft = Partial<Omit<Deal, 'id' | 'client_id' | 'created_at' | 'updated_at'>> & { product: string; date_taken: string }

const DEFAULTS = {
  platform: null, mediator_id: null, mediator_name: null, deal_type: 'review', amount_paid: '0.00',
  less_amount: '0.00', refund_amount: '0.00',
  commission: '0.00', review_deadline: null, refund_form_deadline: null, refund_form_filled_on: null, review_status: 'pending', form_status: 'pending',
  payment_status: 'pending', payment_received_on: null, notes: null,
} as const

async function mediatorFor(name: string | null | undefined): Promise<Mediator | null> {
  const clean = name?.trim()
  if (!clean) return null
  const all = await db.mediators.toArray()
  const found = all.find((m) => m.name.toLowerCase() === clean.toLowerCase())
  if (found) return found
  const now = nowIso()
  const m: Mediator = { id: uuid(), name: clean, contact: null, created_at: now, updated_at: now }
  await db.mediators.put(m)
  await enqueue({ type: 'mediator', op: 'upsert', id: m.id, data: { name: clean }, label: `New mediator ${clean}` })
  return m
}

const tables = () => [db.deals, db.mediators, db.outbox]

export async function createDeal(draft: DealDraft): Promise<Deal> {
  const id = uuid()
  const deal = await db.transaction('rw', tables(), async () => {
    const m = await mediatorFor(draft.mediator_name)
    const now = nowIso()
    const d: Deal = { ...DEFAULTS, ...draft, mediator_id: m?.id ?? null, mediator_name: m?.name ?? null, id, client_id: id, created_at: now, updated_at: now }
    d.refund_amount = fromPaise(toPaise(d.amount_paid) - toPaise(d.less_amount) + toPaise(d.commission))
    await db.deals.put(d)
    const data = Object.fromEntries(Object.entries(d).filter(([key]) =>
      !['id', 'client_id', 'created_at', 'updated_at', 'refund_amount'].includes(key)))
    await enqueue({ type: 'deal', op: 'upsert', id, client_id: id, data, label: d.product })
    return d
  })
  if (draft.platform) local.set('last_platform', draft.platform)
  if (deal.mediator_name) local.set('last_mediator', deal.mediator_name)
  engine.poke()
  return deal
}

export async function updateDeal(id: string, patch: Partial<Deal>): Promise<void> {
  await db.transaction('rw', tables(), async () => {
    const cur = await db.deals.get(id)
    if (!cur) return
    const changes: Partial<Deal> = { ...patch }
    if ('mediator_name' in patch) {
      const m = await mediatorFor(patch.mediator_name)
      changes.mediator_id = m?.id ?? null
      changes.mediator_name = m?.name ?? null
    }
    const updated = { ...cur, ...changes, updated_at: nowIso() }
    updated.refund_amount = fromPaise(toPaise(updated.amount_paid) - toPaise(updated.less_amount) + toPaise(updated.commission))
    await db.deals.put(updated)
    const data = Object.fromEntries(Object.entries(changes).filter(([key]) => key !== 'refund_amount'))
    await enqueue({ type: 'deal', op: 'upsert', id, data, label: cur.product })
  })
  engine.poke()
}

/** Returns the previous values so the caller can offer Undo. */
export async function dealAction(deal: Deal, action: Action, today: string): Promise<Partial<Deal>> {
  const changes = applyAction(deal, action, today)
  const previous = Object.fromEntries(Object.keys(changes).map((k) => [k, deal[k as keyof Deal]])) as Partial<Deal>
  await updateDeal(deal.id, changes)
  return previous
}

export async function deleteDeal(id: string): Promise<void> {
  await db.transaction('rw', tables(), async () => {
    const cur = await db.deals.get(id)
    await db.deals.delete(id)
    await enqueue({ type: 'deal', op: 'delete', id, data: {}, label: cur?.product })
  })
  engine.poke()
}

export async function createMediator(name: string): Promise<Mediator | null> {
  const m = await db.transaction('rw', tables(), () => mediatorFor(name))
  engine.poke()
  return m
}

export async function updateMediator(id: string, patch: { name: string; contact: string | null }): Promise<void> {
  await db.transaction('rw', tables(), async () => {
    const cur = await db.mediators.get(id)
    if (!cur) return
    await db.mediators.put({ ...cur, name: patch.name, contact: patch.contact, updated_at: nowIso() })
    if (patch.name !== cur.name) await db.deals.where('mediator_id').equals(id).modify({ mediator_name: patch.name })
    await enqueue({ type: 'mediator', op: 'upsert', id, data: { name: patch.name, contact: patch.contact }, label: `Update ${patch.name}` })
  })
  engine.poke()
}

export async function deleteMediator(id: string): Promise<void> {
  await db.transaction('rw', tables(), async () => {
    const cur = await db.mediators.get(id)
    await db.mediators.delete(id)
    await enqueue({ type: 'mediator', op: 'delete', id, data: {}, label: cur ? `Delete ${cur.name}` : undefined })
  })
  engine.poke()
}
