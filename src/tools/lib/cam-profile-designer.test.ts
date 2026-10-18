import { describe, expect, it } from 'vitest'
import { lawF, profile, summarize, svaj, type Law } from './cam-profile-designer'

describe('cam profile designer', () => {
  it('every rise law goes 0 → 1 with zero end velocity (except constant velocity)', () => {
    for (const law of ['cycloidal', 'harmonic', 'poly345', 'poly4567', 'parabolic'] as Law[]) {
      expect(lawF(law, 0)[0]).toBeCloseTo(0, 12)
      expect(lawF(law, 1)[0]).toBeCloseTo(1, 12)
      expect(lawF(law, 0.5)[0]).toBeCloseTo(0.5, 12)
      expect(lawF(law, 1)[1]).toBeCloseTo(0, 9)
    }
  })
  it('textbook peak coefficients', () => {
    expect(lawF('cycloidal', 0.5)[1]).toBeCloseTo(2) // v_max = 2h/β
    expect(lawF('cycloidal', 0.25)[2]).toBeCloseTo(2 * Math.PI) // a_max = 2πh/β²
    expect(lawF('harmonic', 0.5)[1]).toBeCloseTo(Math.PI / 2) // v_max = πh/2β
    expect(lawF('poly345', 0.5)[1]).toBeCloseTo(1.875)
    expect(lawF('poly345', 0.5 - Math.sqrt(3) / 6)[2]).toBeCloseTo(5.7735, 3)
    expect(lawF('parabolic', 0.2)[2]).toBe(4)
  })
  it('derivatives agree with finite differences', () => {
    const h = 1e-5
    for (const law of ['cycloidal', 'harmonic', 'poly345', 'poly4567'] as Law[]) {
      for (const u of [0.13, 0.5, 0.77]) {
        const d = (lawF(law, u + h)[0] - lawF(law, u - h)[0]) / (2 * h)
        expect(d).toBeCloseTo(lawF(law, u)[1], 5)
        const d2 = (lawF(law, u + h)[1] - lawF(law, u - h)[1]) / (2 * h)
        expect(d2).toBeCloseTo(lawF(law, u)[2], 4)
      }
    }
  })
  it('rise-dwell-return-dwell diagram and roller profile', () => {
    const segs = [{ deg: 120, lift: 20, law: 'cycloidal' as Law }, { deg: 60, lift: 20, law: 'cycloidal' as Law }, { deg: 120, lift: 0, law: 'cycloidal' as Law }, { deg: 60, lift: 0, law: 'cycloidal' as Law }]
    const sm = svaj(segs, 0, 720)
    expect(sm[120].s).toBeCloseTo(10, 6) // 60° = halfway up
    expect(sm[300].s).toBeCloseTo(20, 6)
    const beta = (120 * Math.PI) / 180
    expect(Math.max(...sm.map((p) => p.v))).toBeCloseTo((2 * 20) / beta, 2)
    const pr = profile(sm, 'roller', 40, 10, 0)
    // during dwells the pitch curve is a circle of radius rb + rr (+ lift)
    expect(Math.hypot(...pr.pitch[0])).toBeCloseTo(50, 9)
    expect(Math.hypot(...pr.pitch[300])).toBeCloseTo(70, 9)
    expect(Math.hypot(...pr.surface[0])).toBeCloseTo(40, 3)
    expect(pr.rho[700]).toBeCloseTo(40, 1) // base-circle dwell: ρ = rb
    // zero offset: tan φ = v / (s0 + s)
    expect(pr.pressure[120]).toBeCloseTo((Math.atan(sm[120].v / 60) * 180) / Math.PI, 9)
    const sum = summarize(sm, pr)
    expect(sum.maxPA).toBeLessThan(30)
    expect(pr.undercut).toBe(false)
    // a huge roller on a tiny cam undercuts
    expect(profile(svaj([{ deg: 60, lift: 30, law: 'harmonic' }, { deg: 300, lift: 0, law: 'harmonic' }], 0), 'roller', 10, 25, 0).undercut).toBe(true)
  })
  it('flat-faced follower radius of curvature = rb + s + s″', () => {
    const sm = svaj([{ deg: 180, lift: 10, law: 'harmonic' }, { deg: 180, lift: 0, law: 'harmonic' }], 0, 360)
    const pr = profile(sm, 'flat', 30, 0, 0)
    expect(pr.rho[90]).toBeCloseTo(30 + sm[90].s + sm[90].a, 9)
    expect(Math.hypot(...pr.surface[0])).toBeCloseTo(30, 9)
  })
})
