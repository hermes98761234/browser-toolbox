import { describe, expect, it } from 'vitest'
import { compileCurve, compileSurface, curvature, curveInfo, evalConst, PRESETS, sampleSurface } from './parametric-surface-viewer'

describe('parametric surfaces', () => {
  it('sphere of radius 2: K = 1/4, |H| = 1/2, area 16π', () => {
    const f = compileSurface('a sin(v) cos(u)', 'a sin(v) sin(u)', 'a cos(v)', 2)
    const c = curvature(f, 1, 1.2, 1e-4, 1e-4)
    expect(c.K).toBeCloseTo(0.25, 3)
    expect(Math.abs(c.H)).toBeCloseTo(0.5, 3)
    const m = sampleSurface(f, 0, 2 * Math.PI, 0, Math.PI, 120, 80)
    expect(m.area).toBeCloseTo(16 * Math.PI, 0)
    expect(m.bad).toBe(0)
    expect(m.totalK / (2 * Math.PI)).toBeCloseTo(2, 1) // Gauss–Bonnet: χ(sphere) = 2
  })
  it('torus: K = cos v / (r (R + r cos v))', () => {
    const f = compileSurface('(a + cos(v)) cos(u)', '(a + cos(v)) sin(u)', 'sin(v)', 3)
    const v = 0.7
    expect(curvature(f, 0.3, v, 1e-4, 1e-4).K).toBeCloseTo(Math.cos(v) / (3 + Math.cos(v)), 3)
  })
  it('helicoid is minimal (H = 0)', () => {
    const f = compileSurface('v cos(u)', 'v sin(u)', 'u', 1)
    expect(curvature(f, 0.4, 0.8, 1e-4, 1e-4).H).toBeCloseTo(0, 4)
  })
  it('constants and curves', () => {
    expect(evalConst('2pi')).toBeCloseTo(2 * Math.PI)
    const helix = compileCurve('cos(t)', 'sin(t)', 'a t', 0)
    const info = curveInfo(helix, 0, 2 * Math.PI, 2000)
    expect(info.len).toBeCloseTo(2 * Math.PI, 3)
    expect(info.kappa(1)).toBeCloseTo(1, 3)
  })
  it('all presets compile and produce finite points', () => {
    for (const p of PRESETS) {
      const u = (evalConst(p.u[0], p.a) + evalConst(p.u[1], p.a)) / 2
      if (p.kind === 'surface') expect(compileSurface(p.x, p.y, p.z, p.a ?? 1)(u, 0.6).every(Number.isFinite)).toBe(true)
      else expect(compileCurve(p.x, p.y, p.z, p.a ?? 1)(u).every(Number.isFinite)).toBe(true)
    }
  })
})
