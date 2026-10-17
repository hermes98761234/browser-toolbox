import { describe, expect, it } from 'vitest'
import { band, dli, fit, frameLuminance, luxFromExposure, PLANTS, srgbToLinear } from './houseplant-light-meter'

describe('light meter', () => {
  it('linearizes sRGB', () => {
    expect(srgbToLinear(0)).toBe(0)
    expect(srgbToLinear(255)).toBeCloseTo(1, 9)
    expect(srgbToLinear(118)).toBeCloseTo(0.181, 3) // mid grey
  })
  it('frame luminance', () => {
    const white = frameLuminance([255, 255, 255, 255, 0, 0, 0, 255])
    expect(white.y).toBeCloseTo(0.5, 6)
    expect(white.clipped).toBe(0.5)
  })
  it('exposure to lux', () => {
    // EV100 = 15 (sunny 16: f/16, 1/100 s, ISO 100 ≈ EV 14.6) — 2.5·2^EV
    expect(luxFromExposure(1, 1, 100, 0.18)).toBeCloseTo(2.5, 6)
    expect(luxFromExposure(16, 1 / 125, 100, 0.18)).toBeCloseTo(2.5 * 256 * 125, 3)
  })
  it('bands, DLI and fit', () => {
    expect(band(100).name).toBe('Too dark')
    expect(band(5000).name).toBe('Bright indirect')
    expect(dli(10000, 12)).toBeCloseTo(7.99, 2)
    const zz = PLANTS[0]
    expect(fit(100, zz)).toBe('low')
    expect(fit(2000, zz)).toBe('ideal')
  })
})
