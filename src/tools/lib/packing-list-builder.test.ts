import { describe, expect, it } from 'vitest'
import { generate, quantity, type Settings } from './packing-list-builder'

const base: Settings = { days: 7, activities: [], climate: 'mild', laundry: false, laundryEvery: 4, international: false }
const q = (s: Settings, name: string) => generate(s).find((i) => i.name === name)?.qty

describe('packing list builder', () => {
  it('scales clothes by days', () => {
    expect(q(base, 'Underwear')).toBe(8) // 1 + 7
    expect(q(base, 'T-shirts / tops')).toBe(6) // ceil(1 + 4.9)
    expect(q(base, 'Pants / trousers')).toBe(3) // ceil(1 + 1.4)
    expect(q({ ...base, days: 30 }, 'Pants / trousers')).toBe(4) // capped
  })
  it('caps clothes by the laundry cycle but not meds', () => {
    const s = { ...base, days: 14, laundry: true, laundryEvery: 4 }
    expect(q(s, 'Underwear')).toBe(5)
    expect(q(s, 'Prescription meds (days + 2 spare)')).toBe(16)
  })
  it('adds activities and merges duplicates', () => {
    const items = generate({ ...base, activities: ['beach'], climate: 'hot' })
    expect(items.filter((i) => i.name === 'Sunglasses')).toHaveLength(1)
    expect(items.find((i) => i.name === 'Sunscreen SPF 30+ (bottle)')?.qty).toBe(2)
    expect(q({ ...base, activities: ['kids'], days: 3 }, 'Diapers')).toBe(18)
  })
  it('never returns zero for a listed item', () => {
    expect(quantity({ cat: 'Food', name: 'x', base: 0, perDay: 2, max: 0 }, { ...base, days: 0 })).toBe(1)
  })
})
