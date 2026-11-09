import { describe, expect, it } from 'vitest'
import type { Deal } from '../data/types'
import { monthlyOverview } from './homeData'

function deal(overrides: Partial<Deal>): Deal {
  return {
    id: 'deal-id', client_id: 'client-id', product: 'Sample deal', platform: null, mediator_id: null, mediator_name: null,
    deal_type: 'review', date_taken: '2026-06-01', amount_paid: '100.00', less_amount: '20.00', refund_amount: '90.00', commission: '10.00',
    review_deadline: null, refund_form_deadline: null, review_status: 'pending', form_status: 'pending', payment_status: 'pending',
    payment_received_on: null, notes: null, created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('monthly home summary', () => {
  it('returns six months and counts refunds only after payment is received', () => {
    const months = monthlyOverview([
      deal({ date_taken: '2026-06-02', payment_status: 'received', amount_paid: '100.00', less_amount: '20.00', refund_amount: '90.00', commission: '10.00' }),
      deal({ date_taken: '2026-06-10', payment_status: 'pending', amount_paid: '50.00', less_amount: '10.00', refund_amount: '40.00' }),
      deal({ date_taken: '2025-12-31', amount_paid: '500.00' }),
    ], '2026-06-15')

    expect(months).toHaveLength(6)
    expect(months.map(({ key }) => key)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'])
    expect(months[5]).toMatchObject({ paid: 15000, refunded: 9000, gainLoss: -1000, hasData: true })
    expect(months[0]?.hasData).toBe(false)
  })
})
