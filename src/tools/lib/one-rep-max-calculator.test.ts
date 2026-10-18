import { describe, expect, it } from 'vitest'
import { estimates, oneRm, pctTable, platesFor, repsAt } from './one-rep-max-calculator'

describe('one rep max', () => {
  it('reference formulas for 100 x 5', () => {
    expect(oneRm('epley', 100, 5)).toBeCloseTo(116.667, 2)
    expect(oneRm('brzycki', 100, 5)).toBeCloseTo(112.5, 6)
    expect(oneRm('lombardi', 100, 5)).toBeCloseTo(117.461, 2)
    expect(oneRm('oconner', 100, 5)).toBeCloseTo(112.5, 6)
    expect(oneRm('mayhew', 100, 5)).toBeCloseTo(119.0, 0)
    expect(oneRm('wathan', 100, 5)).toBeCloseTo(116.6, 0)
  })
  it('single rep is the max; average of chosen formulas', () => {
    expect(oneRm('mayhew', 140, 1)).toBe(140)
    expect(estimates(100, 5, ['epley', 'brzycki']).avg).toBeCloseTo((116.667 + 112.5) / 2, 2)
  })
  it('percentage table and reps', () => {
    const t = pctTable(200)
    expect(t[0]).toEqual({ pct: 100, weight: 200, reps: 1 })
    expect(t.at(-1)!.weight).toBe(100)
    expect(repsAt(120, 100)).toBe(6)
  })
  it('plate breakdown', () => {
    const inf = [25, 20, 15, 10, 5, 2.5, 1.25].map((plate) => ({ plate, pairs: 99 }))
    const r = platesFor(142.5, 20, 0, inf)
    expect(r.side).toEqual([{ plate: 25, pairs: 2 }, { plate: 10, pairs: 1 }, { plate: 1.25, pairs: 1 }])
    expect(r.total).toBe(142.5)
    // limited stock: only one 20 pair, target 100 on 20 bar → 40/side = 20 + 20? no → 20 + 15 + 5
    const lim = [{ plate: 20, pairs: 1 }, { plate: 15, pairs: 1 }, { plate: 5, pairs: 2 }]
    expect(platesFor(100, 20, 0, lim).total).toBe(100)
    // unreachable remainder rounds down
    expect(platesFor(101, 20, 0, inf).total).toBe(100)
  })
})
