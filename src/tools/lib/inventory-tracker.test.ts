import { describe, expect, it } from 'vitest'
import { dailyUsage, daysOfCover, findCode, recommendedRop, reorderDate, status, suggestOrder, valuation, type Item, type Move } from './inventory-tracker'

const item = (p: Partial<Item>): Item => ({ id: 'a', sku: 'SKU-1', name: 'Widget', category: '', location: '', barcode: '4006381333931', qty: 20, unit: 'pcs', reorderPoint: 10, reorderQty: 30, leadDays: 7, cost: 2, price: 5, supplier: '', ...p })
const mv = (date: string, delta: number, reason: Move['reason'] = 'sold'): Move => ({ id: date + delta, itemId: 'a', date, delta, reason, note: '' })

describe('inventory-tracker', () => {
  it('classifies stock', () => {
    expect(status(item({ qty: 0 }))).toBe('out')
    expect(status(item({ qty: 10 }))).toBe('low')
    expect(status(item({ qty: 11 }))).toBe('ok')
    expect(status(item({ qty: 81 }))).toBe('over')
  })
  it('computes usage from outflows only', () => {
    const m = [mv('2026-10-10', -6), mv('2026-10-01', -9), mv('2026-08-01', -100), mv('2026-10-05', 50, 'received'), mv('2026-10-06', -5, 'adjust')]
    expect(dailyUsage(m, 'a', '2026-10-17', 30)).toBeCloseTo(15 / 30)
    expect(daysOfCover(20, 0.5)).toBe(40)
    expect(daysOfCover(20, 0)).toBe(Infinity)
    expect(recommendedRop(0.5, 7)).toBe(6)
  })
  it('suggests orders and dates', () => {
    expect(suggestOrder(item({ qty: 4 }))).toBe(36)
    expect(suggestOrder(item({ qty: 12 }))).toBe(0)
    expect(reorderDate(item({ qty: 20 }), 1, '2026-10-17')).toBe('2026-10-27')
    expect(reorderDate(item({}), 0, '2026-10-17')).toBe('')
  })
  it('values stock and finds codes', () => {
    expect(valuation([item({}), item({ qty: -3 })])).toEqual({ cost: 40, retail: 100, units: 20 })
    expect(findCode([item({})], ' sku-1 ')?.id).toBe('a')
    expect(findCode([item({})], '4006381333931')?.id).toBe('a')
    expect(findCode([item({})], '')).toBeUndefined()
  })
})
