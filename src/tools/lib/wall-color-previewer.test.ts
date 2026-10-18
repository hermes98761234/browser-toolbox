import { describe, expect, it } from 'vitest'
import { brush, floodFill, hexToLab, lrv, recolor, toLab } from './wall-color-previewer'

// 6×4 image: left 3 columns light grey with a gentle gradient, right 3 columns dark blue.
function img() {
  const w = 6, h = 4, d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (x < 3) d.set([200 + x * 3, 200 + x * 3, 200 + x * 3, 255], i)
      else d.set([20, 30, 120, 255], i)
    }
  return { w, h, d }
}

describe('wall colour previewer', () => {
  it('flood fill stays inside the similar region', () => {
    const { w, h, d } = img()
    const lab = toLab(d), mask = new Uint8Array(w * h)
    expect(floodFill(lab, w, h, 0, 0, 5, mask, 1)).toBe(12)
    expect(mask[5]).toBe(0)
    expect(mask[2]).toBe(1)
  })
  it('smart brush skips dissimilar pixels; erase clears', () => {
    const { w, h, d } = img()
    const lab = toLab(d), mask = new Uint8Array(w * h)
    brush(lab, w, h, 2, 1, 3, mask, 2, 5)
    expect(mask[1 * w + 4]).toBe(0)
    expect(mask[1 * w + 1]).toBe(2)
    brush(lab, w, h, 2, 1, 3, mask, 0)
    expect([...mask].every((v) => v === 0)).toBe(true)
  })
  it('recolour preserves relative lightness and takes the paint hue', () => {
    const { w, h, d } = img()
    const lab = toLab(d), mask = new Uint8Array(w * h)
    floodFill(lab, w, h, 0, 0, 5, mask, 1)
    const out = recolor(d, lab, mask, [{ color: '#3a7d44', strength: 1 }])
    const o = toLab(out)
    // brighter source pixel stays brighter after recolouring
    expect(o[2 * 3]).toBeGreaterThan(o[0])
    // mean lightness ≈ the paint's lightness
    const p = hexToLab('#3a7d44')
    expect((o[0] + o[3] + o[6]) / 3).toBeCloseTo(p[0], 1)
    // hue follows the paint (green: a < 0)
    expect(o[1]).toBeLessThan(0)
    // unmasked pixels untouched
    expect(out[5 * 4]).toBe(20)
  })
  it('LRV of white ≈ 100, black = 0', () => {
    expect(lrv('#ffffff')).toBeCloseTo(100, 3)
    expect(lrv('#000000')).toBe(0)
  })
})
