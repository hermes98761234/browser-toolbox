import { describe, expect, it } from 'vitest'
import { clearance, evenShelves, layout, maxFacings, shareBy, shelfUse, type Placement, type Product, type Unit } from './shelf-planogram-designer'

const u: Unit = { bays: 1, bayW: 100, height: 180, depth: 40, shelves: [10, 50, 90, 130], thick: 2 }
const P = (id: string, w: number, h: number, d: number, brand = 'A', stack = false): Product => ({ id, name: id, brand, w, h, d, color: '#000', price: 1, stack })

describe('shelf-planogram-designer', () => {
  it('computes clearance between shelves', () => {
    expect(clearance(u, 0)).toBe(38)
    expect(clearance(u, 3)).toBe(50)
    expect(evenShelves(180, 4, 12)).toEqual([12, 54, 96, 138])
  })
  it('lays out facings left to right with capacity and checks', () => {
    const prods = [P('a', 10, 20, 8), P('b', 30, 40, 10, 'B'), P('c', 8, 12, 8, 'A', true)]
    const pl: Placement[] = [
      { id: '1', pid: 'a', bay: 0, shelf: 0, facings: 3, order: 0 },
      { id: '2', pid: 'b', bay: 0, shelf: 0, facings: 3, order: 1 },
      { id: '3', pid: 'c', bay: 0, shelf: 1, facings: 2, order: 0 },
    ]
    const L = layout(u, prods, pl)
    expect(L[0].x).toBe(0.5)
    expect(L[0].units).toBe(3 * 5) // 40/8 deep
    expect(L[1].x).toBe(0.5 + 30 + 0.5)
    expect(L[1].over).toBe(true) // 31 + 90 > 100
    expect(L[1].tall).toBe(true) // 40 > 38
    expect(L[2].high).toBe(3) // stackable: floor(38/12)
    expect(L[2].units).toBe(2 * 5 * 3)
    expect(shelfUse(u, L)[0].used).toBeCloseTo(121)
    const share = shareBy(L, (l) => l.prod.brand)
    expect(share[0][0]).toBe('B')
    expect(maxFacings(u, L, pl[1], prods[1])).toBe(2) // 100 − 30.5 − 1 = 68.5 → 2 × 30
  })
})
