import { describe, expect, it } from 'vitest'
import { coverage, dotSize, rgbToCmyk, screen, toneCurve } from './halftone-generator'

const solid = (w: number, h: number, rgb: [number, number, number]) => ({ width: w, height: h, data: Array.from({ length: w * h }, () => [...rgb, 255]).flat() })

describe('halftone', () => {
  it('converts RGB to CMYK', () => {
    expect(rgbToCmyk(1, 0, 0)).toEqual([0, 1, 1, 0])
    expect(rgbToCmyk(0, 0, 0)).toEqual([0, 0, 0, 1])
    const g = rgbToCmyk(0.5, 0.5, 0.5)
    expect(g[3]).toBeCloseTo(0.5)
    expect(g[0]).toBeCloseTo(0)
  })
  it('dot area matches coverage', () => {
    const r = dotSize(0.5, 10, 'circle')
    expect(Math.PI * r * r).toBeCloseTo(50)
    expect((2 * dotSize(0.25, 10, 'square')) ** 2).toBeCloseTo(25)
    expect(2 * dotSize(0.3, 10, 'line') * 10).toBeCloseTo(30)
    const d = dotSize(0.5, 10, 'diamond')
    expect(2 * d * d).toBeCloseTo(50)
  })
  it('screens a mid-grey image to ~50% coverage at any angle', () => {
    const img = solid(60, 40, [128, 128, 128])
    for (const a of [0, 15, 45]) {
      const dots = screen(img, 6, a, 'k', true)
      const area = dots.filter((d) => d.x > 6 && d.x < 54 && d.y > 6 && d.y < 34).reduce((s, d) => s + d.s, 0)
      expect(area / dots.filter((d) => d.x > 6 && d.x < 54 && d.y > 6 && d.y < 34).length).toBeCloseTo(0.5, 1)
      expect(dots.length).toBeGreaterThan(40)
    }
    expect(coverage(solid(2, 2, [255, 0, 0]), 0, 0, 'm', false)).toBe(1)
  })
  it('tone curve', () => {
    expect(toneCurve(1, 1, false)(0.3)).toBeCloseTo(0.3)
    expect(toneCurve(1, 1, true)(0.3)).toBeCloseTo(0.7)
    expect(toneCurve(2, 1, false)(0.9)).toBe(1)
  })
})
