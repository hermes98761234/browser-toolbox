import { describe, expect, it } from 'vitest'
import { addDays, applyScan, daysLeft, shoppingList, shoppingText, sortItems, status, type Item } from './pantry-inventory'

const it0 = (p: Partial<Item>): Item => ({ id: p.name ?? 'x', name: 'x', cat: 'Other', place: 'Pantry', qty: 1, unit: 'pc', min: 0, exp: '', code: '', ...p })

describe('pantry inventory', () => {
  it('counts days and classifies expiry', () => {
    expect(daysLeft('2026-10-20', '2026-10-17')).toBe(3)
    expect(daysLeft('2026-11-01', '2026-10-25')).toBe(7) // across DST change
    expect(daysLeft('', '2026-10-17')).toBeNull()
    expect(status('2026-10-16', '2026-10-17')).toBe('expired')
    expect(status('2026-10-17', '2026-10-17')).toBe('today')
    expect(status('2026-10-19', '2026-10-17')).toBe('soon')
    expect(status('2026-10-24', '2026-10-17')).toBe('week')
    expect(status('2026-12-24', '2026-10-17')).toBe('ok')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })
  it('sorts by expiry with no-expiry items last', () => {
    const s = sortItems([it0({ name: 'rice' }), it0({ name: 'milk', exp: '2026-10-20' }), it0({ name: 'eggs', exp: '2026-10-18' })], 'expiry')
    expect(s.map((i) => i.name)).toEqual(['eggs', 'milk', 'rice'])
  })
  it('builds a shopping list from low stock and expired items', () => {
    const l = shoppingList([
      it0({ name: 'Milk', cat: 'Dairy', qty: 0, min: 1, unit: 'l' }),
      it0({ name: 'Pasta', cat: 'Dry goods', qty: 1, min: 2, unit: 'pack' }),
      it0({ name: 'Yogurt', cat: 'Dairy', qty: 4, min: 1, exp: '2026-10-10' }),
      it0({ name: 'Rice', qty: 5, min: 1 }),
    ], '2026-10-17')
    expect(l.map((x) => [x.name, x.qty, x.why])).toEqual([
      ['Milk', 2, 'out of stock'],
      ['Yogurt', 4, 'expired'],
      ['Pasta', 3, 'running low'],
    ])
    expect(shoppingText(l)).toContain('Dairy\n[ ] Milk — 2 l (out of stock)')
  })
  it('scans increment known barcodes', () => {
    const items = [it0({ name: 'Beans', code: '4006381333931', qty: 2 })]
    expect(applyScan(items, '4006381333931')![0].qty).toBe(3)
    expect(applyScan(items, '4006381333931', -5)![0].qty).toBe(0)
    expect(applyScan(items, '123')).toBeNull()
  })
})
