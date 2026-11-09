import { afterEach, describe, expect, it } from 'vitest'
import { blankMapping, loadMapping, saveMapping, suggestMappings } from './mapping'

afterEach(() => localStorage.clear())

describe('import column mapping', () => {
  it('suggests target fields from common messy spreadsheet headers', () => {
    const result = suggestMappings(['Item name', 'Marketplace', 'Agent / seller', 'Order date', 'Price paid', 'Mediator less', 'Refunded amount', 'Commission', 'Remarks'])
    expect(result.mapping.product).toBe(0)
    expect(result.mapping.platform).toBe(1)
    expect(result.mapping.mediator).toBe(2)
    expect(result.mapping.date_taken).toBe(3)
    expect(result.mapping.amount_paid).toBe(4)
    expect(result.mapping.less_amount).toBe(5)
    expect(result.mapping.refund_amount).toBe(6)
    expect(result.mapping.commission).toBe(7)
    expect(result.mapping.notes).toBe(8)
    expect(result.confidence.product).toBe('high')
  })

  it('remembers mappings per user and header set, including reordered columns', () => {
    const headers = ['Item name', 'Price paid', 'Order date']
    const mapping = { ...blankMapping(), product: 0, amount_paid: 1, date_taken: 2 }
    saveMapping(localStorage, 'user-a', headers, mapping)

    expect(loadMapping(localStorage, 'user-a', ['Order date', 'Item name', 'Price paid'])).toMatchObject({
      product: 1,
      amount_paid: 2,
      date_taken: 0,
    })
    expect(loadMapping(localStorage, 'user-b', headers)).toBeNull()
    expect(loadMapping(localStorage, 'user-a', ['Product', 'Paid', 'Date'])).toBeNull()
  })
})
