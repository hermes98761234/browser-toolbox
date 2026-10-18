import { describe, expect, it } from 'vitest'
import { completeness, groupBy, itemTotal, pdfSafe, search, wrap, type Item } from './home-inventory-catalog'

const mk = (p: Partial<Item>): Item => ({ id: 'x', name: 'Item', room: 'Kitchen', category: 'Appliances', brand: '', serial: '', purchased: '', qty: 1, value: 0, paid: 0, notes: '', photos: [], ...p })

describe('home inventory', () => {
  const items = [mk({ name: 'TV', room: 'Living room', value: 900, serial: 'A1', photos: ['p'] }), mk({ name: 'Chair', room: 'Living room', qty: 4, value: 50 }), mk({ name: 'Mixer', value: 300 })]
  it('totals and grouping', () => {
    expect(itemTotal(items[1])).toBe(200)
    const g = groupBy(items, 'room')
    expect(g.map((x) => [x.name, x.value, x.count])).toEqual([['Living room', 1100, 5], ['Kitchen', 300, 1]])
  })
  it('search by words and room', () => {
    expect(search(items, 'tv a1', '').map((i) => i.name)).toEqual(['TV'])
    expect(search(items, '', 'Kitchen').length).toBe(1)
  })
  it('completeness', () => {
    const c = completeness(items)
    expect(c.photo).toBeCloseTo(1 / 3)
    expect(c.value).toBe(1)
  })
  it('pdf-safe text and wrapping', () => {
    expect(pdfSafe('Café €5 ₴ 😀\nok')).toBe('Café €5 ? ? ok')
    expect(wrap('aa bb cc dd', 5, (s) => s.length)).toEqual(['aa bb', 'cc dd'])
  })
})
