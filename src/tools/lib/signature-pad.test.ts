import { describe, expect, it } from 'vitest'
import { bounds, demoStrokes, outline, smooth, thin, toSvg, widths, type Pt } from './signature-pad'

const O = { minW: 1, maxW: 4, velFilter: 0.7, pressure: false }

describe('signature-pad', () => {
  it('thins jittery points but keeps endpoints', () => {
    const p: Pt[] = [{ x: 0, y: 0, t: 0 }, { x: 0.5, y: 0, t: 1 }, { x: 5, y: 0, t: 2 }, { x: 5.2, y: 0, t: 3 }]
    expect(thin(p).map((q) => q.x)).toEqual([0, 5, 5.2])
  })
  it('fast strokes are thinner than slow ones', () => {
    const line = (dt: number) => Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: 0, t: i * dt }))
    const slow = widths(line(50), O), fast = widths(line(2), O)
    expect(fast[19]).toBeLessThan(slow[19])
    expect(Math.min(...fast)).toBeGreaterThanOrEqual(1)
    expect(Math.max(...slow)).toBeLessThanOrEqual(4)
    expect(widths([{ x: 0, y: 0, t: 0, p: 1 }], { ...O, pressure: true })[0]).toBe(4)
  })
  it('smoothed line passes through start and end with dense samples', () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: (i % 2) * 10, t: i * 16 }))
    const s = smooth(pts, O)
    expect(s[0]).toMatchObject({ x: 0, y: 0 })
    expect(s[s.length - 1]).toMatchObject({ x: 90, y: 10 })
    for (let i = 1; i < s.length; i++) expect(Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y)).toBeLessThan(2.5)
  })
  it('outline encloses the stroke and svg is trimmed', () => {
    const s = smooth([{ x: 10, y: 10, t: 0 }, { x: 110, y: 10, t: 500 }], { ...O, minW: 4, maxW: 4 })
    const b = bounds([outline(s)])!
    expect(b.x).toBeCloseTo(8, 0)
    expect(b.w).toBeCloseTo(104, 0)
    expect(b.h).toBeCloseTo(4, 0)
    const svg = toSvg([outline(s)], '#123', 8)
    expect(svg).toContain('width="120"')
    expect(svg).toContain('fill="#123"')
    expect(demoStrokes(600, 200)).toHaveLength(4)
  })
})
