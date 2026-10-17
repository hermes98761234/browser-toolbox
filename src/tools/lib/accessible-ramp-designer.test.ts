import { describe, expect, it } from 'vitest'
import { checks, IN, planRamp, type RampInput } from './accessible-ramp-designer'

const base: RampInput = { rise: 0.9, ratio: 12, maxSegRise: 0.76, landing: 1.525, width: 0.915, layout: 'straight', gap: 0.1 }

describe('accessible-ramp-designer', () => {
  it('splits the rise into runs at 1:12', () => {
    const p = planRamp(base)
    expect(p.segments.length).toBe(2)
    expect(p.segments[0].rise).toBeCloseTo(0.45, 9)
    expect(p.totalRun).toBeCloseTo(10.8, 9)
    expect(p.slopePct).toBeCloseTo(8.333, 3)
    expect(p.angleDeg).toBeCloseTo(4.7636, 3)
    expect(p.footprint.w).toBeCloseTo(15.375, 9)
    expect(p.footprint.d).toBeCloseTo(0.915, 9)
    expect(p.pieces[p.pieces.length - 1].y0).toBeCloseTo(0.9, 9)
    expect(p.handrailsRequired).toBe(true)
  })
  it('lays out L-shaped and switchback ramps', () => {
    const l = planRamp({ ...base, layout: 'l-shape' })
    expect(l.footprint.w).toBeCloseTo(8.45, 9)
    expect(l.footprint.d).toBeCloseTo(8.45, 9)
    const s = planRamp({ ...base, layout: 'switchback' })
    expect(s.footprint.w).toBeCloseTo(8.45, 9)
    expect(s.footprint.d).toBeCloseTo(1.93, 9)
  })
  it('flags non-compliant inputs', () => {
    const p = { ...base, ratio: 10, width: 30 * IN }
    const c = checks(p, planRamp(p), 10)
    expect(c.filter((x) => !x.ok).length).toBe(3)
    expect(planRamp({ ...base, rise: 0.1 }).handrailsRequired).toBe(false)
    expect(planRamp({ ...base, rise: 0 }).segments.length).toBe(0)
  })
})
