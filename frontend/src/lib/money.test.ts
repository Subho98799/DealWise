import { describe, expect, it } from 'vitest'
import { formatINR, fromPaise, legacyRefundToComponents, refundBreakdown, toPaise } from './money'

describe('exact rupee arithmetic', () => {
  it('translates legacy refunds using integer paise', () => {
    expect(legacyRefundToComponents('1100.00', '1000.00', '200.00')).toEqual({
      lessAmount: '100.00', commission: '200.00',
    })
    expect(legacyRefundToComponents('1100.00', '1200.00', '50.00')).toEqual({
      lessAmount: '0.00', commission: '150.00',
    })
  })

  it('formats Indian grouping and preserves signed paise', () => {
    expect(formatINR(fromPaise(120000))).toBe('₹1,200.00')
    expect(toPaise('0.01')).toBe(1)
  })

  it('renders the live net refund breakdown with Indian grouping', () => {
    expect(refundBreakdown('1100', '100', '200'))
      .toBe('₹1,100.00 - ₹100.00 + ₹200.00 = Net refund ₹1,200.00')
  })
})
