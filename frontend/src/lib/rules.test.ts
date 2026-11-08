import { describe, expect, it } from 'vitest'
import { applyAction, evaluate, matchesChip, nextAction, RuleError } from './rules'
import { formatINR, fromPaise, isValidMoney, toPaise } from './money'
import { countdown, formatShort, todayIn } from './dates'
import type { Deal } from '../data/types'

const T = '2026-06-10'
const deal = (p: Partial<Deal> = {}): Deal => ({
  id: 'd', client_id: 'd', product: 'x', platform: null, mediator_id: null, mediator_name: null, deal_type: 'review',
  date_taken: '2026-06-01', amount_paid: '0.00', refund_amount: '0.00', commission: '0.00', review_deadline: null,
  refund_form_deadline: null, review_status: 'pending', form_status: 'pending', payment_status: 'pending',
  payment_received_on: null, notes: null, created_at: '', updated_at: '', ...p,
})

describe('urgency', () => {
  it.each([
    ['2026-06-09', true, true, 'review_overdue'],
    ['2026-06-10', true, false, 'review_due_soon'],
    ['2026-06-11', true, false, 'review_due_soon'],
    ['2026-06-12', true, false, 'review_due_soon'],
    ['2026-06-13', false, false, null],
  ])('review deadline %s', (rd, urgent, overdue, reason) => {
    const u = evaluate(deal({ review_deadline: rd }), T, 2)
    expect([u.isUrgent, u.isOverdue, u.reason]).toEqual([urgent, overdue, reason])
  })
  it('ignores finished steps and picks the earliest deadline', () => {
    expect(evaluate(deal({ review_deadline: '2026-06-01', review_status: 'done' }), T, 2).isUrgent).toBe(false)
    expect(evaluate(deal({ review_deadline: '2026-06-11', refund_form_deadline: '2026-06-08' }), T, 2).reason).toBe('form_overdue')
    expect(matchesChip(deal({ review_deadline: T }), 'needs_action', T, 0)).toBe(true)
  })
  it('computes today in the user timezone around midnight IST', () => {
    expect(todayIn('Asia/Kolkata', new Date('2026-06-10T18:29:00Z'))).toBe('2026-06-10')
    expect(todayIn('Asia/Kolkata', new Date('2026-06-10T18:31:00Z'))).toBe('2026-06-11')
    expect(todayIn('UTC', new Date('2026-06-10T18:31:00Z'))).toBe('2026-06-10')
  })
  it('formats countdowns and dates', () => {
    expect(countdown('2026-06-12', T)).toBe('Due in 2 days')
    expect(countdown(T, T)).toBe('Due today')
    expect(countdown('2026-06-07', T)).toBe('Overdue by 3 days')
    expect(formatShort('2026-11-08')).toBe('8 Nov')
  })
})

describe('actions', () => {
  it('follows review -> form -> payment and rejects invalid transitions', () => {
    const d = deal()
    expect(nextAction(d)).toBe('review_done')
    expect(() => applyAction(d, 'payment_received', T)).toThrow(RuleError)
    expect(applyAction({ ...d, review_status: 'done', form_status: 'submitted' }, 'payment_received', T))
      .toEqual({ payment_status: 'received', payment_received_on: T })
    expect(() => applyAction({ ...d, review_status: 'done', form_status: 'submitted' }, 'reopen_review', T)).toThrow('Reopen the refund form first.')
  })
})

describe('money', () => {
  it('uses Indian grouping and exact paise arithmetic', () => {
    expect(formatINR('123456.00')).toBe('₹1,23,456.00')
    expect(formatINR('10000000.00')).toBe('₹1,00,00,000.00')
    expect(formatINR('999')).toBe('₹999.00')
    expect(formatINR(-5050)).toBe('−₹50.50')
    expect(fromPaise(toPaise('0.10') + toPaise('0.20'))).toBe('0.30')
    expect(toPaise('1299.5')).toBe(129950)
  })
  it('validates amounts', () => {
    for (const ok of ['0', '1299', '1299.5', '10000000.00']) expect(isValidMoney(ok)).toBe(true)
    for (const bad of ['-1', '1.234', 'abc', '10000000.01', '1e3']) expect(isValidMoney(bad)).toBe(false)
  })
})
