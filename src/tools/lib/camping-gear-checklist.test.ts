import { describe, expect, it } from 'vitest'
import { consumablesFor, fmtW, type Gear, totals, weightClass } from './camping-gear-checklist'

const G = (p: Partial<Gear>): Gear => ({ id: Math.random().toString(), name: 'x', cat: 'Shelter', grams: 100, qty: 1, kind: 'carried', packed: false, on: true, ...p })

describe('camping-gear-checklist', () => {
  it('splits base, worn and consumable weight', () => {
    const t = totals([G({ grams: 1000 }), G({ grams: 200, qty: 2, cat: 'Kitchen', packed: true }), G({ grams: 500, kind: 'worn', cat: 'Clothing' }), G({ grams: 1400, kind: 'consumable', cat: 'Food' }), G({ grams: 9999, on: false })])
    expect(t.base).toBe(1400)
    expect(t.worn).toBe(500)
    expect(t.consumable).toBe(1400)
    expect(t.packWeight).toBe(2800)
    expect(t.skinOut).toBe(3300)
    expect(t.byCat).toEqual({ Shelter: 1000, Kitchen: 400, Food: 1400 })
    expect(t.items).toBe(4)
    expect(t.packed).toBe(1)
  })
  it('classifies base weight', () => {
    expect(weightClass(2000)).toBe('Super-ultralight')
    expect(weightClass(4000)).toBe('Ultralight')
    expect(weightClass(8000)).toBe('Lightweight')
    expect(weightClass(10000)).toBe('Traditional')
  })
  it('formats and estimates consumables', () => {
    expect(fmtW(1500, 'metric')).toBe('1.50 kg')
    expect(fmtW(453.59237, 'imperial')).toBe('1.00 lb')
    expect(fmtW(56.7, 'imperial')).toBe('2.0 oz')
    expect(consumablesFor(3, 2, 2)).toEqual({ food: 4200, water: 2000 })
  })
})
