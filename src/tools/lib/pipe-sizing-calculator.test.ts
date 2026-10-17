import { describe, expect, it } from 'vitest'
import { budget, demandGpm, evaluateSizes, frictionPsi100, MATERIALS, maxFlow, velocityFps, wsfuFor } from './pipe-sizing-calculator'

describe('pipe-sizing-calculator', () => {
  it('Hunter curve', () => {
    expect(demandGpm(10, false)).toBe(14.6)
    expect(demandGpm(22.5, false)).toBeCloseTo(20.55, 2)
    expect(demandGpm(100, true)).toBe(64.3)
    expect(demandGpm(3, true)).toBe(6.5)
    expect(wsfuFor(14.6, false)).toBeCloseTo(10, 3)
  })
  it('Hazen-Williams and velocity', () => {
    expect(frictionPsi100(10, 0.785, 140)).toBeCloseTo(11.07, 1)
    expect(velocityFps(10, 0.785)).toBeCloseTo(6.63, 2)
    const d = 1.025, C = 140
    const q = maxFlow(d, C, 100, 5)
    expect(frictionPsi100(q, d, C)).toBeCloseTo(5, 6)
  })
  it('pressure budget and size selection', () => {
    const b = budget({ supply: 60, elevation: 20, minPressure: 8, meterLoss: 5, otherLoss: 0, length: 100, fittingPct: 50 })
    expect(b.available).toBeCloseTo(60 - 8.66 - 8 - 5, 6)
    expect(b.allowable).toBeCloseTo((38.34 / 150) * 100, 6)
    const rows = evaluateSizes(20, MATERIALS[0], 8, b.allowable, b.equivLength)
    const pick = rows.find((r) => r.okV && r.okF)
    expect(pick?.size).toBe('1')
  })
})
