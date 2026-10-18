import { describe, expect, it } from 'vitest'
import { coil, filterKnots, KNOTS, knotStrength } from './fishing-knot-guide'

describe('fishing knot guide', () => {
  it('has eight knots with steps and valid paths', () => {
    expect(KNOTS).toHaveLength(8)
    for (const k of KNOTS) {
      expect(k.steps.length).toBeGreaterThanOrEqual(4)
      expect(k.strength[0]).toBeLessThanOrEqual(k.strength[1])
      for (const s of k.steps) for (const e of s.els) expect(e.d).toMatch(/^M[\d.-]+,[\d.-]+/)
      for (const s of k.steps) for (const e of s.els) expect(e.d).not.toMatch(/NaN/)
    }
  })
  it('draws coils starting and ending at the expected points', () => {
    const d = coil(0, 100, 50, 2, 10)
    expect(d.startsWith(' L0.0,60.0')).toBe(true)
    expect(d.endsWith(' L100.0,60.0')).toBe(true)
  })
  it('computes approximate knot strength', () => {
    const pal = KNOTS.find((k) => k.id === 'palomar')!
    expect(knotStrength(20, pal)).toEqual([17, 19])
  })
  it('filters by use, line and text', () => {
    expect(filterKnots('join', 'any', '').map((k) => k.id)).toEqual(['doubleuni', 'blood', 'surgeon'])
    expect(filterKnots('all', 'braid', '').some((k) => k.id === 'clinch')).toBe(false)
    expect(filterKnots('all', 'any', 'leader').length).toBeGreaterThan(0)
  })
})
