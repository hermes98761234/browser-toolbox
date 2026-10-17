import { describe, expect, it } from 'vitest'
import { applyDuotone, buildLut, hexToRgb, labToRgb, rgbToHex, rgbToLab } from './duotone-image-maker'

describe('duotone', () => {
  it('hex helpers', () => {
    expect(hexToRgb('#f0a')).toEqual([255, 0, 170])
    expect(rgbToHex([30, 50, 100])).toBe('#1e3264')
  })
  it('Lab round trip and white point', () => {
    const w = rgbToLab([255, 255, 255])
    expect(w[0]).toBeCloseTo(100, 2)
    expect(Math.abs(w[1])).toBeLessThan(0.01)
    const c = labToRgb(rgbToLab([200, 40, 90]))
    expect(c[0]).toBeCloseTo(200, 1)
    expect(c[1]).toBeCloseTo(40, 1)
    expect(c[2]).toBeCloseTo(90, 1)
  })
  it('LUT endpoints are the chosen colours in every space', () => {
    for (const sp of ['rgb', 'linear', 'lab'] as const) {
      const lut = buildLut('#102030', '#f0e0d0', sp)
      expect(Math.abs(lut[0] - 0x10)).toBeLessThanOrEqual(1)
      expect(Math.abs(lut[255 * 3 + 2] - 0xd0)).toBeLessThanOrEqual(1)
    }
    const tri = buildLut('#000000', '#ffffff', 'rgb', '#ff0000', 0.5)
    expect([tri[128 * 3 - 3], tri[128 * 3 - 2]]).toEqual([254, 0])
  })
  it('maps black to shadow and white to highlight', () => {
    const src = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 128])
    const dst = new Uint8ClampedArray(8)
    applyDuotone(src, dst, buildLut('#1e3264', '#f037a5', 'rgb'), { contrast: 0, brightness: 0, gamma: 1, invert: false, blend: 0 })
    expect(Array.from(dst)).toEqual([30, 50, 100, 255, 240, 55, 165, 128])
  })
})
