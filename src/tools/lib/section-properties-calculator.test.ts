import { describe, expect, it } from 'vitest'
import { contoursToText, parseContours, PRESETS, sectionProps } from './section-properties-calculator'

const pre = (id: string, v?: Record<string, number>) => {
  const p = PRESETS.find((x) => x.id === id)!
  return sectionProps(p.build(v ?? Object.fromEntries(p.params.map(([k, , d]) => [k, d]))))!
}
const rel = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(tol)

describe('section properties', () => {
  it('rectangle closed forms', () => {
    const r = pre('rect', { b: 200, h: 400 })
    rel(r.A, 80000)
    rel(r.cx, 100)
    rel(r.cy, 200)
    rel(r.Ix, (200 * 400 ** 3) / 12)
    rel(r.Iy, (400 * 200 ** 3) / 12)
    expect(Math.abs(r.Ixy)).toBeLessThan(1e-3)
    rel(r.SxTop, (200 * 400 ** 2) / 6)
    rel(r.Zx, (200 * 400 ** 2) / 4, 1e-6)
    rel(r.pnaY, 200, 1e-6)
  })
  it('I-beam matches hand calculation', () => {
    const d = 300, bf = 150, tf = 10.7, tw = 7.1
    const r = pre('ibeam', { d, bf, tf, tw })
    const hw = d - 2 * tf
    rel(r.A, 2 * bf * tf + hw * tw)
    rel(r.Ix, (bf * d ** 3 - (bf - tw) * hw ** 3) / 12)
    rel(r.Iy, (2 * tf * bf ** 3 + hw * tw ** 3) / 12)
    rel(r.Zx, bf * tf * (d - tf) + (tw * hw * hw) / 4, 1e-6)
  })
  it('hole is subtracted regardless of point order', () => {
    const r = pre('rhs', { b: 100, h: 200, t: 10 })
    rel(r.A, 100 * 200 - 80 * 180)
    rel(r.Ix, (100 * 200 ** 3 - 80 * 180 ** 3) / 12)
    const txt = contoursToText(PRESETS[2].build({ b: 100, h: 200, t: 10 }).map((c) => ({ ...c, pts: [...c.pts].reverse() })))
    rel(sectionProps(parseContours(txt).contours)!.Ix, r.Ix)
  })
  it('circle polygon approaches πd⁴/64', () => {
    const r = pre('circle', { d: 100 })
    rel(r.Ix, (Math.PI * 100 ** 4) / 64, 3e-3)
    rel(r.Zx, 100 ** 3 / 6, 3e-3)
  })
  it('unequal angle: centroid and product of inertia', () => {
    // L 150x90x10 legs as rectangles: A1 = 10*150 (vertical), A2 = 80*10 (horizontal)
    const r = pre('angle', { a: 150, b: 90, t: 10 })
    const A1 = 1500, A2 = 800
    const cx = (A1 * 5 + A2 * 50) / (A1 + A2), cy = (A1 * 75 + A2 * 5) / (A1 + A2)
    rel(r.cx, cx)
    rel(r.cy, cy)
    const Ixy = A1 * (5 - cx) * (75 - cy) + A2 * (50 - cx) * (5 - cy)
    rel(r.Ixy, Ixy)
    expect(r.I1).toBeGreaterThan(r.Ix)
    rel(r.I1 + r.I2, r.Ix + r.Iy)
  })
  it('parser reports errors', () => {
    const p = parseContours('0,0\n1,0\nfoo\n\n0,0\n1,1')
    expect(p.errors.length).toBe(3)
    expect(p.contours.length).toBe(0)
  })
})
