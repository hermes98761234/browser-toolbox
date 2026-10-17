import { describe, expect, it } from 'vitest'
import { dpiVerdict, fitCrop, orientRatio, parseRatio, PHI, printDpi } from './aspect-ratio-cropper'

describe('aspect-ratio-cropper', () => {
  it('parses ratios', () => {
    expect(parseRatio('16:9')).toBeCloseTo(16 / 9)
    expect(parseRatio('4x5')).toBeCloseTo(0.8)
    expect(parseRatio('1.85')).toBeCloseTo(1.85)
    expect(parseRatio('4/0')).toBeNull()
    expect(parseRatio('abc')).toBeNull()
  })
  it('orients to the photo', () => {
    expect(orientRatio(1.5, 4000, 3000, 'auto')).toBeCloseTo(1.5)
    expect(orientRatio(1.5, 3000, 4000, 'auto')).toBeCloseTo(2 / 3)
    expect(orientRatio(0.8, 4000, 3000, 'landscape')).toBeCloseTo(1.25)
    expect(orientRatio(0.8, 4000, 3000, 'as-is')).toBeCloseTo(0.8)
  })
  it('fits the largest crop', () => {
    expect(fitCrop(6000, 4000, 1)).toEqual({ x: 1000, y: 0, w: 4000, h: 4000 })
    const r = fitCrop(6000, 4000, 16 / 9)
    expect(r.w).toBe(6000)
    expect(r.h).toBeCloseTo(3375)
    // centre near the edge gets clamped inside
    expect(fitCrop(6000, 4000, 1, 0.95).x).toBe(2000)
  })
  it('computes print dpi', () => {
    expect(printDpi({ x: 0, y: 0, w: 1800, h: 1200 }, [6, 4])).toBe(300)
    expect(printDpi({ x: 0, y: 0, w: 1200, h: 1800 }, [6, 4])).toBe(300)
    expect(dpiVerdict(180)).toBe('Acceptable')
    expect(PHI[0] + PHI[1]).toBeCloseTo(1)
  })
})
