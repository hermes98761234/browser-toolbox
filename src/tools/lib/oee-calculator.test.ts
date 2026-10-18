import { describe, expect, it } from 'vitest'
import { combine, oee, waterfall, type Shift } from './oee-calculator'

// Classic textbook example: 480 min shift, 2×15 min breaks + 30 min meal, 47 min down,
// ideal 1.0 s/part … here rebuilt with round numbers.
const s: Shift = { id: 'a', name: 'A', shiftMin: 480, breakMin: 60, breakdownMin: 35, setupMin: 12, smallStopMin: 10, idealCycleSec: 60 / 60, total: 19271, startupRejects: 100, rejects: 323 }

describe('OEE', () => {
  it('computes A, P, Q and OEE = A × P × Q', () => {
    const r = oee(s)
    expect(r.planned).toBe(420)
    expect(r.run).toBe(373)
    expect(r.A).toBeCloseTo(373 / 420, 10)
    expect(r.P).toBeCloseTo(19271 / 60 / 373, 10)
    expect(r.Q).toBeCloseTo((19271 - 423) / 19271, 10)
    expect(r.oee).toBeCloseTo(r.A * r.P * r.Q, 10)
  })
  it('waterfall losses add up', () => {
    const w = waterfall(oee(s))
    const [planned, b, st, run, ss, sp, net, sr, pr, full] = w.map((x) => x.value)
    expect(planned - b - st).toBeCloseTo(run, 10)
    expect(run - ss - sp).toBeCloseTo(net, 10)
    expect(net - sr - pr).toBeCloseTo(full, 10)
  })
  it('combined shifts are time-weighted', () => {
    const t: Shift = { ...s, id: 'b', total: 15000, idealCycleSec: 1.2, breakdownMin: 80 }
    const r1 = oee(s), r2 = oee(t)
    const c = combine([r1, r2])
    expect(c.oee).toBeCloseTo((r1.fullyProductive + r2.fullyProductive) / (r1.planned + r2.planned), 10)
  })
  it('handles empty shifts without NaN', () => {
    const r = oee({ ...s, total: 0, shiftMin: 0, breakMin: 0 })
    expect(r.oee).toBe(0)
    expect(Number.isNaN(r.P)).toBe(false)
  })
})
