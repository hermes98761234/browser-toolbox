import { describe, expect, it } from 'vitest'
import { contrast, harmony, hexToRgb, hslToRgb, oklchToRgb, rgbToHex, rgbToHsl, rgbToOklch, scale } from './palette-generator'

describe('colour math', () => {
  it('hex/hsl conversions', () => {
    expect(hexToRgb('#f00')).toEqual([255, 0, 0])
    expect(hexToRgb('zzz')).toBeNull()
    expect(rgbToHsl([255, 0, 0])).toEqual([0, 100, 50])
    expect(rgbToHex(hslToRgb([120, 100, 25]))).toBe('#008000')
    expect(rgbToHex(hslToRgb(rgbToHsl([18, 52, 86])))).toBe('#123456')
  })
  it('oklch round-trip and reference', () => {
    const [L, C, h] = rgbToOklch([255, 0, 0])
    expect(L).toBeCloseTo(0.628, 3)
    expect(C).toBeCloseTo(0.2577, 3)
    expect(h).toBeCloseTo(29.23, 1)
    expect(rgbToHex(oklchToRgb(rgbToOklch([18, 52, 86])))).toBe('#123456')
    // out of gamut gets chroma-clipped, still valid
    expect(oklchToRgb([0.7, 0.4, 150]).every((v) => v >= 0 && v <= 255)).toBe(true)
  })
  it('contrast', () => {
    expect(contrast([255, 255, 255], [0, 0, 0])).toBeCloseTo(21)
    expect(contrast([118, 118, 118], [255, 255, 255])).toBeCloseTo(4.54, 1)
  })
  it('harmonies and scales', () => {
    const c = harmony([255, 0, 0], 'complementary', 'hsl')
    expect(rgbToHex(c[1])).toBe('#00ffff')
    expect(harmony([200, 50, 50], 'triadic').length).toBe(3)
    const sc = scale([59, 130, 246])
    expect(sc.length).toBe(11)
    for (let i = 1; i < sc.length; i++) expect(rgbToOklch(sc[i])[0]).toBeLessThan(rgbToOklch(sc[i - 1])[0])
  })
})
