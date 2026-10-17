import { describe, expect, it } from 'vitest'
import { DEFAULTS, area, beaufort, bridle, minWind, offset, outline, spars, tiling, type Pt } from './kite-designer'

describe('kite designer', () => {
  it('diamond area = spine × span / 2', () => {
    const p = DEFAULTS.diamond
    expect(area(outline(p))).toBeCloseTo((900 * 800) / 2, 6)
    expect(spars(p).map((s) => s.length)).toEqual([900, 800])
  })
  it('delta geometry', () => {
    const p = DEFAULTS.delta
    expect(area(outline(p))).toBeCloseTo((1500 * 750) / 2, 6)
    const le = spars(p).find((s) => s.name === 'Leading edge')!
    expect(le.length).toBeCloseTo(Math.hypot(750, 900), 6)
    expect(le.qty).toBe(2)
    expect(spars(p).find((s) => s.name === 'Spreader')!.length).toBeCloseTo(0.55 * 1500, 6)
  })
  it('rokkaku hexagon area', () => {
    const p = DEFAULTS.rokkaku // 1000 tall, 800 wide, ends 400 wide, shoulders at 200 / 800
    // middle rectangle 800 × 600 + two trapezoids (400 + 800) / 2 × 200
    expect(area(outline(p))).toBeCloseTo(800 * 600 + 2 * 1200 / 2 * 200, 6)
  })
  it('bridle legs are Pythagorean', () => {
    const b = bridle({ ...DEFAULTS.diamond, spine: 1000, crossAt: 0.2, towAt: 0.35, bridleDepth: 400 })
    expect(b.a1).toBe(200)
    expect(b.a2).toBe(800)
    expect(b.upper).toBeCloseTo(Math.hypot(150, 400), 9)
    expect(b.lower).toBeCloseTo(Math.hypot(450, 400), 9)
    // tow point clamped between attachments
    expect(bridle({ ...DEFAULTS.diamond, towAt: 0 }).tow).toBe(bridle(DEFAULTS.diamond).a1)
  })
  it('offsets outward for any winding', () => {
    const sq: Pt[] = [[0, 0], [100, 0], [100, 100], [0, 100]]
    const o = offset(sq, 10)
    expect(o[0][0]).toBeCloseTo(-10, 9)
    expect(o[0][1]).toBeCloseTo(-10, 9)
    expect(area(o)).toBeCloseTo(120 * 120, 6)
    expect(area(offset([...sq].reverse(), 10))).toBeCloseTo(120 * 120, 6)
    expect(area(offset(outline(DEFAULTS.diamond), 15))).toBeGreaterThan(area(outline(DEFAULTS.diamond)))
  })
  it('tiles pages with overlap', () => {
    const t = tiling(1000, 600, 190, 277, 10)
    expect(t.cols).toBe(Math.ceil(990 / 180))
    expect(t.rows).toBe(Math.ceil(590 / 267))
    expect(tiling(100, 100, 190, 277, 10).pages).toBe(1)
  })
  it('estimates minimum wind', () => {
    const w = minWind(DEFAULTS.diamond, 40, 25)
    expect(w.area).toBeCloseTo(0.36, 6)
    expect(w.kmh).toBeGreaterThan(5)
    expect(w.kmh).toBeLessThan(20)
    expect(beaufort(0.5)).toBe(0)
    expect(beaufort(15)).toBe(3)
  })
})
