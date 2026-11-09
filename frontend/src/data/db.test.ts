import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalDB } from './db'
import type { Deal, OutboxOp } from './types'

const name = 'dealwise-upgrade-test'
let upgraded: LocalDB | undefined

afterEach(async () => {
  upgraded?.close()
  upgraded = undefined
  await Dexie.delete(name)
})

describe('local database migrations', () => {
  it('converts stored deals and queued legacy refund edits without losing totals', async () => {
    const old = new Dexie(name)
    old.version(1).stores({
      deals: 'id, updated_at, mediator_id',
      mediators: 'id, name',
      outbox: '++seq, op_id, status, id',
      meta: 'key',
    })
    await old.open()
    await old.table('deals').bulkPut([
      { id: 'deal-under', amount_paid: '1100.00', refund_amount: '1000.00', commission: '200.00' },
      { id: 'deal-over', amount_paid: '1100.00', refund_amount: '1200.00', commission: '25.00' },
    ])
    await old.table('outbox').bulkPut([
      {
        op_id: 'op-under', type: 'deal', op: 'upsert', id: 'deal-under',
        data: { amount_paid: '1100.00', refund_amount: '1000.00', commission: '200.00' },
        client_updated_at: '2026-11-09T00:00:00Z', status: 'pending',
      },
      {
        op_id: 'op-over', type: 'deal', op: 'upsert', id: 'deal-over',
        data: { refund_amount: '1200.00' },
        client_updated_at: '2026-11-09T00:01:00Z', status: 'pending',
      },
    ] satisfies OutboxOp[])
    old.close()

    upgraded = new LocalDB(name)
    await upgraded.open()

    const under = await upgraded.deals.get('deal-under') as Deal
    const over = await upgraded.deals.get('deal-over') as Deal
    expect([under.less_amount, under.commission, under.refund_amount]).toEqual([
      '100.00', '200.00', '1200.00',
    ])
    expect([over.less_amount, over.commission, over.refund_amount]).toEqual([
      '0.00', '125.00', '1225.00',
    ])

    const ops = await upgraded.outbox.orderBy('seq').toArray()
    expect(ops[0].data).toEqual({ amount_paid: '1100.00', commission: '200.00', less_amount: '100.00' })
    expect(ops[1].data).toEqual({ commission: '125.00', less_amount: '0.00' })
  })
})
