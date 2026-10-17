import { describe, expect, it } from 'vitest'
import { bfToM3, boardFeet, line, m3ToBf, quarters, totals } from './board-foot-calculator'

describe('board-foot-calculator', () => {
  it('computes board feet', () => {
    expect(boardFeet(1, 12, 1)).toBe(1)
    expect(boardFeet(2, 4, 8)).toBeCloseTo(5.333, 3)
    expect(boardFeet(quarters(8), 6, 10, 3)).toBe(30)
    expect(bfToM3(1)).toBeCloseTo(0.0023597, 7)
    expect(m3ToBf(1)).toBeCloseTo(423.776, 3)
  })
  it('handles metric lines, waste and totals', () => {
    const m = line({ id: '', name: '', species: 'Oak', t: 25.4, w: 304.8, l: 0.3048, qty: 1, price: 1000 }, true)
    expect(m.bf).toBeCloseTo(1, 6)
    expect(m.cost).toBeCloseTo(2.3597, 3)
    const p = { id: '', name: '', species: 'Walnut', t: 1, w: 6, l: 8, qty: 2, price: 12 }
    expect(line(p, false, 15).bf).toBeCloseTo(9.2)
    const t = totals([p, { ...p, species: 'Oak', price: 6 }], false)
    expect(t.all.bf).toBeCloseTo(16)
    expect(t.all.cost).toBeCloseTo(144)
    expect(t.bySpecies[0][0]).toBe('Walnut')
  })
})
