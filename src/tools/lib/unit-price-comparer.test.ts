import { describe, expect, it } from 'vitest'
import { baseQty, mainDim, parseSize, pricePerBase, rank, type Item } from './unit-price-comparer'

const it0 = (p: Partial<Item>): Item => ({ id: 'x', name: 'x', price: 1, size: 1, unit: 'g', packs: 1, discount: 0, ...p })

describe('unit price comparer', () => {
  it('normalises units', () => {
    expect(baseQty({ size: 1, unit: 'lb', packs: 1 })).toBeCloseTo(453.59237, 6)
    expect(baseQty({ size: 2, unit: 'l', packs: 3 })).toBe(6000)
    expect(baseQty({ size: 1, unit: 'gal', packs: 1 })).toBeCloseTo(3785.41, 2)
    expect(baseQty({ size: 0, unit: 'g', packs: 1 })).toBeNaN()
  })
  it('applies discount', () => {
    expect(pricePerBase(it0({ price: 10, size: 1, unit: 'kg', discount: 20 }))).toBeCloseTo(0.008, 9)
  })
  it('ranks cheapest first and computes % above best', () => {
    const r = rank([
      it0({ id: 'a', price: 3.5, size: 500, unit: 'g' }), // 0.007/g
      it0({ id: 'b', price: 6, size: 1, unit: 'kg' }), // 0.006/g
      it0({ id: 'c', price: 2, size: 12, unit: 'oz' }), // 0.00588/g
      it0({ id: 'd', price: 2, size: 1, unit: 'l' }), // incomparable
    ])
    expect(r.map((x) => x.item.id)).toEqual(['c', 'b', 'a', 'd'])
    expect(r[0].rank).toBe(1)
    expect(r[2].vsBest).toBeCloseTo(0.007 / (2 / 340.19427750) - 1, 6)
    expect(r[3].comparable).toBe(false)
  })
  it('detects the main dimension', () => {
    expect(mainDim([it0({ unit: 'ml' }), it0({ unit: 'l' }), it0({ unit: 'g' })])).toBe('volume')
  })
  it('parses size strings', () => {
    expect(parseSize('6 x 330 ml')).toEqual({ packs: 6, size: 330, unit: 'ml' })
    expect(parseSize('1,5 kg')).toEqual({ packs: 1, size: 1.5, unit: 'kg' })
    expect(parseSize('12 ct')).toEqual({ packs: 1, size: 12, unit: 'each' })
    expect(parseSize('lots')).toBeNull()
  })
})
