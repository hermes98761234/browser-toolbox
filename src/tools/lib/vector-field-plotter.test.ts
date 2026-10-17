import { describe, expect, it } from 'vitest'
import { divCurl, makeField, PRESETS, rk4, streamline } from './vector-field-plotter'

describe('vector field', () => {
  it('compiles every preset', () => {
    for (const p of PRESETS) expect(makeField(p.fx, p.fy, p.fz, p.dim)([0.3, -0.2, 0.1]).every(Number.isFinite)).toBe(true)
    expect(() => makeField('x +', 'y', '0', 2)).toThrow(/Fx/)
  })
  it('RK4 follows a circle in a rotation field', () => {
    const f = makeField('-y', 'x', '0', 2)
    let p: [number, number, number] = [1, 0, 0]
    for (let i = 0; i < 628; i++) p = rk4(f, p, 0.01)
    expect(Math.hypot(p[0], p[1])).toBeCloseTo(1, 6)
    expect(p[0]).toBeCloseTo(Math.cos(6.28), 4)
  })
  it('divergence and curl', () => {
    const r = divCurl(makeField('-y', 'x', '0', 3), [0.5, 0.2, 0])
    expect(r.div).toBeCloseTo(0, 6)
    expect(r.curl[2]).toBeCloseTo(2, 6)
    expect(divCurl(makeField('x', 'y', 'z', 3), [1, 2, 3]).div).toBeCloseTo(3, 6)
    expect(divCurl(makeField('x y', '0', '0', 3), [2, 3, 0]).curl[2]).toBeCloseTo(-2, 6)
  })
  it('streamlines stay inside the box', () => {
    const s = streamline(makeField('x', '-y', '0', 2), [0.5, 0.5, 0], 0.05, 400, 3, 2)
    expect(s.pts.length).toBeGreaterThan(20)
    for (const p of s.pts) expect(Math.abs(p[0]) <= 3 && Math.abs(p[1]) <= 3).toBe(true)
    // saddle streamline obeys x·y = const
    for (const p of s.pts) expect(p[0] * p[1]).toBeCloseTo(0.25, 2)
  })
})
