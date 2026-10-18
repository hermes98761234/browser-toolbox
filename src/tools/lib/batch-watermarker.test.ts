import { describe, expect, it } from 'vitest'
import { autoTone, markSize, meanLuminance, outName, positions } from './batch-watermarker'

describe('batch-watermarker', () => {
  it('sizes marks relative to width, capped by height', () => {
    expect(markSize(1000, 800, 2, 20)).toEqual([200, 100])
    const [w, h] = markSize(1000, 100, 1, 50)
    expect(h).toBeCloseTo(90)
    expect(w).toBeCloseTo(90)
  })
  it('places marks on a 3×3 grid', () => {
    expect(positions(1000, 500, 100, 50, 'tl', 4)).toEqual([[20, 20]])
    expect(positions(1000, 500, 100, 50, 'br', 4)).toEqual([[880, 430]])
    expect(positions(1000, 500, 100, 50, 'mc', 4)).toEqual([[450, 225]])
    expect(positions(1000, 500, 100, 50, 'bc', 0)).toEqual([[450, 450]])
  })
  it('tiles the whole image', () => {
    const t = positions(1000, 500, 100, 50, 'tile', 0)
    expect(t.length).toBeGreaterThan(10)
    expect(Math.min(...t.map((p) => p[0]))).toBeLessThanOrEqual(0)
    expect(Math.max(...t.map((p) => p[0] + 100))).toBeGreaterThanOrEqual(1000)
  })
  it('computes luminance and auto tone', () => {
    expect(meanLuminance([255, 255, 255, 255])).toBeCloseTo(1)
    expect(meanLuminance([0, 0, 0, 255, 255, 255, 255, 0])).toBe(0)
    expect(autoTone(0.9)).toBe('dark')
    expect(autoTone(0.05)).toBe('light')
  })
  it('names outputs', () => {
    expect(outName('{name}-wm', 'IMG_01.jpeg', 1, 'jpg')).toBe('IMG_01-wm.jpg')
    expect(outName('shop-{n}', 'a.png', 7, 'webp')).toBe('shop-007.webp')
  })
})
